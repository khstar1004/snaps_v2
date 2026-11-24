/**
 * Splits Korean source text into the units a slide or a scene is built from.
 *
 * There were two copies of this in card-news.service.ts and they had already
 * drifted: one listed `\n` in its lookbehind and the other did not. Neither
 * worked on the text operators actually paste.
 *
 * Measured on seven shapes of Korean input:
 *
 * - `환절기 건강 관리 요령\n실내 습도를 유지하세요` came back as **one**
 *   sentence. The `\n` in the lookbehind is dead on its own: the pattern still
 *   required `\s+` after it, so a single newline only split when a second
 *   whitespace character followed. Pasted multi-line text became one slide and
 *   the rest of the deck fell back to repeating the whole source.
 * - `- 습도 50%\n- 손 씻기\n- 7시간 수면` came back as one sentence for the
 *   same reason, and a bulleted note is one of the commonest things to paste.
 * - `첫 문장입니다.둘째 문장입니다.` came back as one. Korean is often written
 *   without the space after the full stop.
 *
 * A newline now ends a unit on its own, and a full stop ends one when what
 * follows is a Hangul syllable or a capital letter. That last condition is what
 * keeps `50.5%` in one piece - a digit after the stop is a decimal, not a new
 * sentence.
 *
 * A digit *before* the stop is the same kind of thing, and that half was
 * missing. Measured:
 *
 * - `1. 습도 50% 이상 유지
2. 손 씻기` came back as
 *   `['1.', '습도 50% 이상 유지', '2.', '손 씻기']` - every marker torn off its
 *   item, so a deck built from a numbered list had slides reading just `1.`
 *   and `2.`, and a numbered note is one of the commonest things to paste.
 * - `2026. 9. 12. 에 재입고됩니다.` came back as four units. That is how a
 *   date is written in Korean.
 * - `오늘은 2. 단계를 설명합니다.` split after the ordinal.
 *
 * So a stop preceded by a digit does not end a unit either. The cost is a
 * sentence that genuinely ends in a digit - rare in Korean, and the newline
 * rule still divides it when it is written on its own line.
 *
 * A Latin letter before the stop is the same case again, and that half was
 * missing too. Measured:
 *
 * - `Dr. Kim이 추천한 방법입니다.` came back as `['Dr.', 'Kim이 추천한
 *   방법입니다.']`, so a deck built from it had a slide reading `Dr.`
 * - `vs. 경쟁 제품과 비교했습니다.` split the same way, and `vs.` is ordinary
 *   in Korean comparison copy.
 * - `오전 9시 a.m. 시작합니다.` split twice.
 *
 * The reason it is the same case: a Korean sentence ends on a Hangul syllable,
 * not on a Latin word, so a stop with a letter in front of it is an
 * abbreviation. The cost is an English sentence embedded in Korean copy -
 * `This is great. 다음 주에...` stays one unit - which is the same trade the
 * digit rule already makes, and the newline rule still divides it when the two
 * are written on separate lines.
 */
import { snapsComposeHangul } from '@gitroom/nestjs-libraries/snaps/text/compose-hangul';

const SENTENCE_BREAK =
  /\s*\n+\s*|(?<=[.!?。！？])(?<![0-9A-Za-z][.!?。！？])\s+|(?<=[.!?。！？])(?<![0-9A-Za-z][.!?。！？])(?=[가-힣A-Z])/;

export function snapsSplitSentences(value: string): string[] {
  // Composed first: the `(?=[가-힣A-Z])` half of the rule above is the composed
  // block, so a decomposed paste - the form macOS hands over - never took the
  // no-space split and `첫 문장입니다.둘째 문장입니다.` came back as one unit.
  return snapsComposeHangul(String(value ?? ''))
    .split(SENTENCE_BREAK)
    .map((sentence) => (sentence || '').trim())
    .filter(Boolean);
}
