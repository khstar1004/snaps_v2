type VideoUrlJob = {
  videoUrl: string;
  createdAt: number;
};

export function buildJobsByVideoUrl<T extends VideoUrlJob>(jobs: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  const sorted = [...jobs].sort((a, b) => b.createdAt - a.createdAt);
  for (const job of sorted) {
    const bucket = map.get(job.videoUrl);
    if (bucket) {
      bucket.push(job);
    } else {
      map.set(job.videoUrl, [job]);
    }
  }
  return map;
}
