interface VideoBackgroundProps {
  src: string;
}

export default function VideoBackground({ src }: VideoBackgroundProps) {
  return (
    <div className="siab2p-video-bg" aria-hidden="true">
      <video className="siab2p-video" autoPlay muted loop playsInline preload="metadata" src={src} />
      <div className="siab2p-video-vignette" />
      <div className="siab2p-video-gradient" />
    </div>
  );
}
