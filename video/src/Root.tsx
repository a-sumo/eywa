import { Composition } from "remotion";
import { EywaShort } from "./EywaShort";
import { EywaDemo } from "./EywaDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EywaShort"
        component={EywaShort}
        durationInFrames={30 * 47}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="EywaDemo"
        component={EywaDemo}
        durationInFrames={30 * 105}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
