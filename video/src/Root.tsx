import { Composition, staticFile } from "remotion";
import { EywaDemo } from "./EywaDemo";
import { DEMO_CONFIG } from "./config";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EywaDemo"
        component={EywaDemo}
        durationInFrames={DEMO_CONFIG.totalFrames}
        fps={DEMO_CONFIG.fps}
        width={1920}
        height={1080}
      />
    </>
  );
};
