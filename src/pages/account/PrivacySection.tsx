import { Lock } from '../../components/icons.tsx'
import { useOnline } from '../../lib/connectivity/use-online.ts'
import { CARD, CARD_TITLE } from './account-ui.ts'
import RemoveFromDevice from './RemoveFromDevice.tsx'

/** Where materials are kept, whether this device is online, and erasing them. */
export default function PrivacySection() {
  const online = useOnline()
  return (
    <section aria-labelledby="account-privacy" className={CARD}>
      <h2 id="account-privacy" className={CARD_TITLE}>
        Privacy and data
      </h2>
      <section
        aria-labelledby="account-device"
        className="flex items-start gap-3.5 rounded-xl bg-tile p-4"
      >
        <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-tint text-accent">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            id="account-device"
            className="text-[15px] leading-[1.5] font-semibold text-fg"
          >
            On this device
          </h3>
          <p className="text-sm leading-[1.55] text-muted">
            Your materials and chats are saved to your account on this device
            and work offline. Asking new questions needs a connection.
          </p>
          <p
            role="status"
            className="mt-1 flex items-center gap-2 text-sm leading-[1.5] font-medium text-fg"
          >
            <span
              aria-hidden="true"
              className={`size-2 flex-none rounded-full ${online ? 'bg-online' : 'bg-warn'}`}
            />
            {online ? 'Online' : 'Offline — you can still read saved chats'}
          </p>
        </div>
      </section>
      <p className="flex items-start gap-2 text-sm leading-[1.55] text-muted">
        <Lock size={15} strokeWidth={1.9} className="mt-[3px] flex-none" />
        SomaNami only answers from the materials you add.
      </p>
      <div className="mt-auto border-t border-line pt-[18px]">
        <RemoveFromDevice />
      </div>
    </section>
  )
}
