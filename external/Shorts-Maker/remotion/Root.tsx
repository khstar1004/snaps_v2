import { Composition } from "remotion";
import { StudioShortsComposition } from "./StudioShortsComposition";
import type { StudioRemotionCompositionProps } from "../types/studio-renderer";

const defaultProps: StudioRemotionCompositionProps = {
  slides: [],
  frameDurationsSec: [],
  durationInFrames: 1,
  fps: 30,
  playbackRate: 1,
  branding: {
    headerTitle: "쇼츠뉴스",
    headerAccentText: "핵심 브리핑",
    headerColor: "#1b3f8f",
    footerColor: "rgba(27,63,143,0.9)",
    infoLineText: "",
    fontFamily: '"Pretendard Variable", "Pretendard", -apple-system, BlinkMacSystemFont, "Malgun Gothic", sans-serif',
    imageRounded: true,
  },
  templateImageEnabled: false,
  templateImageUrl: "",
  templateImageLayout: undefined,
  templateLayoutApply: undefined,
};

export const RemotionRoot = () => {
  return (
    <Composition
      id="StudioShorts"
      component={StudioShortsComposition}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={1}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const durationInFrames = Math.max(1, Math.floor(Number(props.durationInFrames) || 1));
        const fps = Math.max(1, Math.floor(Number(props.fps) || 30));
        return {
          width: 1080,
          height: 1920,
          fps,
          durationInFrames,
          props: {
            ...props,
            durationInFrames,
            fps,
          },
        };
      }}
    />
  );
};
