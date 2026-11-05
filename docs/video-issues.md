# User story: Learn from a YouTube video

**As a** learner who has found a helpful YouTube video,
**I want to** paste its link into SomaNami and get explanations in the style I choose,
**so that** I can understand the concept and jump back to the exact moment in the video where it's explained.

## Acceptance criteria
- [ ] **Given** a public YouTube video with captions (up to 30 minutes), **when** I paste its link, **then** within about 2 minutes I see the video embedded alongside a summary and at least one learning mode (visual, map or audio) generated from its content.
- [ ] **Given** a generated explanation, **when** I click a key concept's timestamp, **then** the video jumps to within a few seconds of where that concept is discussed.
- [ ] **Given** a video that can't be processed (private, live, too long, no captions, or caption fetch fails), **when** I submit it, **then** I see a clear message saying why, and I can paste the transcript myself and continue as normal.

## Out of scope
Uploaded MP4s and speech-to-text, reading on-screen slides from video frames, video-specific visuals.

## References
- Scope page and bottleneck diagram (links)


## Sub-issues

# Spike: Confirm caption fetching works from our deployed host

Caption fetching often works locally but is blocked from cloud servers. Find out before we build on it.

## Tasks
- [ ] Deploy a minimal endpoint that fetches captions for one video ID
- [ ] Test 5 to 10 different educational videos from the deployed host
- [ ] Record results and decide: proceed, or lean on the paste-transcript fallback

**Priority:** Do first. Blocks the caption fetching issue.
```

```markdown
# Define shared Source/Segment schema and convert the document pipeline

Videos and documents should share one internal format so the learning modes work for both.

## Tasks
- [ ] Agree on the `Source` and `Segment` shape (type, metadata, segment ID, text, anchor: page or time range)
- [ ] Write it down as a type definition plus a JSON example in the repo
- [ ] Update the PDF/Word pipeline to output this format

**Priority:** Do first, in parallel with the spike. Blocks normalize, understand and learning view.
```

```markdown
# Link intake: Parse, validate and fetch metadata for YouTube links

## Tasks
- [ ] Parse watch, youtu.be, shorts, embed and timestamped URLs down to a video ID
- [ ] Fetch title, duration, thumbnail, embeddability and caption availability (Data API v3 or oEmbed)
- [ ] Reject private, live, non-embeddable and over-length videos with specific messages
- [ ] Show the title and thumbnail so the learner can confirm the video
```

```markdown
# Caption fetching with paste-transcript fallback

## Tasks
- [ ] Wrap the caption library behind one function (`getCaptions(videoId)`) so it can be swapped later
- [ ] Pin the library version
- [ ] Return timestamped fragments, preferring creator captions over auto-generated
- [ ] Build a "Paste transcript" input that feeds the same next step

**Depends on:** Spike
```

```markdown
# Normalize captions into timed segments

## Tasks
- [ ] Group caption fragments into 30 to 60 second segments in code, each with an ID and start/end time
- [ ] Use YouTube chapters from the description if present; otherwise split by topic
- [ ] Run AI cleanup (punctuation, misheard terms) within each segment only, returning the same IDs
- [ ] Skip cleanup for creator-uploaded captions
- [ ] Store raw and cleaned text

**Depends on:** Shared schema, caption fetching
```

```markdown
# Understand: Embeddings and concept extraction with cited segments

## Tasks
- [ ] Embed segments and store them for retrieval
- [ ] Extract concepts, definitions, relationships and prerequisites as JSON, each citing segment IDs
- [ ] Process long videos chapter by chapter, then combine
- [ ] Validate that every cited segment ID exists; drop or flag invalid ones
- [ ] Use prompt caching for repeated transcript calls

**Depends on:** Normalize
```

```markdown
# Learning view: Embedded player, clickable timestamps and existing modes

## Tasks
- [ ] Embed the video with the YouTube IFrame Player API
- [ ] Render timestamps on concepts; clicking seeks the player (handle player-not-ready)
- [ ] Connect existing visual, map and audio modes to video sources
- [ ] Ground Q&A in retrieved segments, not the full transcript

**Depends on:** Shared schema, understand
```

```markdown
# Background processing jobs and progress display

Processing takes 1 to 2 minutes, so it can't run inside a single request.

## Tasks
- [ ] Create a job record on submit and return immediately
- [ ] Move jobs through states: queued, fetching, cleaning, analyzing, ready, failed
- [ ] Show progress in the UI; display the player and summary before other modes finish
- [ ] Process chapters in parallel
```

```markdown
# Caching, logging and demo preparation

## Tasks
- [ ] Cache processed sources by video ID and generated outputs by video, mode and level
- [ ] Log elapsed time and token counts for every step
- [ ] Pre-process the videos we'll use in the demo
