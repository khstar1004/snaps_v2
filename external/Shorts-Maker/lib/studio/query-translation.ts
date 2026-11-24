function containsHangul(value: string): boolean {
  return /[가-힣]/u.test(value);
}

function dedupeQueryValues(values: string[]): string[] {
  const deduped: string[] = [];
  for (const value of values) {
    const compact = value.trim();
    if (!compact) continue;
    if (!deduped.includes(compact)) deduped.push(compact);
  }
  return deduped;
}

const KO_EN_QUERY_MAP: Array<[RegExp, string]> = [
  [/세무|세금|가산세|경정청구|환급|홈택스/gu, "tax filing documents"],
  [/회계|장부|정산/gu, "accounting office work"],
  [/법률|법무|변호사|소송|계약/gu, "legal consultation documents"],
  [/형법|형사|범죄|업무방해|위계/gu, "legal case file"],
  [/상담/gu, "consultation desk meeting"],
  [/서류|증빙|자료/gu, "documents paperwork desk"],
  [/컴퓨터|노트북|입력/gu, "computer office work"],
  [/영수증|계산서|결제/gu, "receipt close up photo"],
  [/노쇼|예약|예약자|예약해놓고|예약 잡아놓고/gu, "restaurant reservation screen"],
  [/연락 끊|답장 없|잠수|무시/gu, "ignored text screen"],
  [/식당|자리|손님 못 받|가게/gu, "empty restaurant table"],
  [/위험|위험해|주의/gu, "warning sign closeup"],
  [/속일|착각/gu, "suspicious booking screen"],
  [/문틈|문|복도|불빛/gu, "hallway door light"],
  [/그림자|실루엣|형체/gu, "shadow silhouette hallway"],
  [/스마트폰|휴대폰|문자|카톡|채팅/gu, "phone text message screen"],
  [/통장|계좌|은행/gu, "bank account book"],
  [/국회|브리핑|기자회견/gu, "press briefing conference"],
  [/자신|당당|뿌듯|우쭐|의기양양/gu, "confident smug reaction"],
  [/당황|민망|뻘쭘|어색|식은땀/gu, "awkward embarrassed reaction"],
  [/놀람|충격|경악|헉/gu, "shocked surprised reaction"],
  [/황당|어이없|말문막|할말잃/gu, "speechless wtf reaction"],
  [/웃김|웃긴|폭소|웃음/gu, "laughing funny reaction"],
  [/슬픔|우울|눈물|울컥/gu, "crying sad reaction"],
  [/고민|걱정|불안|초조/gu, "worried anxious reaction"],
  [/정색|굳음|얼음|무표정/gu, "deadpan serious face"],
  [/멘붕|현타|멍함|멍|머리 하얘/gu, "mind blown stunned reaction"],
  [/빡침|분노|짜증|열받/gu, "angry furious annoyed reaction"],
  [/기쁨|기쁜|행복|행복함|즐거움|즐거운|신남|신난/gu, "happy"],
  [/안도|다행|살았다|여유|느긋|편안|평온|안심/gu, "relieved calm reaction"],
  [/억울|답답|분통/gu, "frustrated upset reaction"],
  [/수상|의심|찝찝|쎄한|촉/gu, "suspicious side eye reaction"],
  [/공포|무섭|오싹|소름|섬뜩/gu, "horror scary creepy"],
  [/새벽|한밤중|심야/gu, "midnight dark night"],
  [/철렁|심장 철렁|심쿵|깜놀/gu, "startled shocked heart drop"],
];

export function toEnglishHint(value: string): string {
  let out = value.trim().replace(/\s+(짤|밈|움짤|gif)$/iu, "").trim();
  for (const [pattern, replacement] of KO_EN_QUERY_MAP) {
    out = out.replace(pattern, ` ${replacement} `);
  }
  const tokens = out
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !containsHangul(token));
  return dedupeQueryValues(tokens).slice(0, 6).join(" ").trim();
}
