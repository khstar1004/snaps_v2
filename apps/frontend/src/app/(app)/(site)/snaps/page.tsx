import { SnapsWorkspace } from '@gitroom/frontend/components/snaps/snaps-workspace';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'snaps 스튜디오',
};

export default function snapsPage() {
  return (
    <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[12px] overflow-auto">
      <SnapsWorkspace />
    </div>
  );
}
