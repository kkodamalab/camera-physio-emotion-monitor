export type ExpressionCategory = "happy" | "relaxed" | "neutral" | "sad" | "angry" | "surprised";
export type FacialFeatures = { smile: number; frown: number; browTension: number; browRaise: number; eyeOpening: number; eyeSquint: number; jawOpening: number; mouthTension: number };
export type ExpressionResult = { category: ExpressionCategory; valence: number; arousal: number; features: FacialFeatures };

export const EXPRESSION_META: Record<ExpressionCategory, { emoji: string; label: string }> = {
  happy: { emoji: "😊", label: "快・活性" }, relaxed: { emoji: "😌", label: "リラックス" }, neutral: { emoji: "😐", label: "中立" }, sad: { emoji: "😢", label: "悲しみ様" }, angry: { emoji: "😠", label: "緊張・怒り様" }, surprised: { emoji: "😮", label: "驚き・高覚醒" },
};

export const EXPRESSION_CONFIG = {
  ema: 0.22,
  weights: { valence: { smile: 1.45, frown: -1.15, browTension: -0.35 }, arousal: { jawOpening: 0.60, eyeOpening: 0.40, browRaise: 0.22, mouthTension: 0.18 } },
  thresholds: { happySmile: 0.35, surprisedEye: 0.28, surprisedJaw: 0.26, angryBrow: 0.28, angryMouth: 0.22, sadFrown: 0.22, relaxedArousal: 0.16, neutralActivity: 0.12 },
};
const average = (a: number, b: number) => (a + b) / 2;
const cap = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function classifyExpression(scores: Map<string, number>): ExpressionResult {
  const score = (name: string) => scores.get(name) ?? 0;
  const features: FacialFeatures = {
    smile: average(score("mouthSmileLeft"), score("mouthSmileRight")), frown: average(score("mouthFrownLeft"), score("mouthFrownRight")), browTension: average(score("browDownLeft"), score("browDownRight")), browRaise: score("browInnerUp"), eyeOpening: average(score("eyeWideLeft"), score("eyeWideRight")), eyeSquint: average(score("eyeSquintLeft"), score("eyeSquintRight")), jawOpening: score("jawOpen"), mouthTension: average(score("mouthPressLeft"), score("mouthPressRight")) + score("mouthFunnel") * 0.5,
  };
  const w = EXPRESSION_CONFIG.weights;
  const valence = cap(features.smile * w.valence.smile + features.frown * w.valence.frown + features.browTension * w.valence.browTension, -1, 1);
  const arousal = cap(features.jawOpening * w.arousal.jawOpening + features.eyeOpening * w.arousal.eyeOpening + features.browRaise * w.arousal.browRaise + features.mouthTension * w.arousal.mouthTension, 0, 1);
  const t = EXPRESSION_CONFIG.thresholds; const activity = Math.max(features.smile, features.frown, features.browTension, features.browRaise, features.eyeOpening, features.eyeSquint, features.jawOpening, features.mouthTension);
  let category: ExpressionCategory = "neutral";
  if (features.eyeOpening > t.surprisedEye && (features.jawOpening > t.surprisedJaw || features.browRaise > t.surprisedEye)) category = "surprised";
  else if (features.browTension > t.angryBrow && features.mouthTension > t.angryMouth && valence < -0.12) category = "angry";
  else if (features.smile > t.happySmile && valence > 0.16) category = "happy";
  else if (features.frown > t.sadFrown && valence < -0.12 && arousal < 0.46) category = "sad";
  else if (arousal < t.relaxedArousal && features.browTension < 0.12 && features.jawOpening < 0.12 && valence > -0.08) category = "relaxed";
  else if (activity < t.neutralActivity) category = "neutral";
  return { category, valence, arousal, features };
}

export function smooth(previous: { valence: number; arousal: number; category: ExpressionCategory; votes: ExpressionCategory[] } | null, next: ExpressionResult) {
  const k = EXPRESSION_CONFIG.ema; const valence = previous ? previous.valence * (1 - k) + next.valence * k : next.valence; const arousal = previous ? previous.arousal * (1 - k) + next.arousal * k : next.arousal;
  const votes = [...(previous?.votes ?? []), next.category].slice(-8); const category = (Object.keys(EXPRESSION_META) as ExpressionCategory[]).sort((a, b) => votes.filter(v => v === b).length - votes.filter(v => v === a).length)[0] ?? next.category;
  return { valence, arousal, category, votes };
}
