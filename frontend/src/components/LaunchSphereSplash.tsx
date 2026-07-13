import WelcomeSphereLayer from "./WelcomeSphereLayer";

/** Same sphere intro as first-run welcome, without the setup card — dismisses after the dwell beat. */
export default function LaunchSphereSplash({ onFinished }: { onFinished: () => void }) {
  return (
    <div
      className="welcome-sphere-hero-host fixed inset-0 z-[36] overflow-hidden"
      aria-hidden
    >
      <WelcomeSphereLayer onBackdropReady={onFinished} />
    </div>
  );
}
