// Persist the policy on each new world; never reinterpret an existing season.
export const FIRST_RECRUITMENT_SEASON=6;
export const LEGACY_RECRUITMENT_WEIGHTS=Object.freeze([9000,700,250,50]);
export const RECRUITMENT_WEIGHTS=Object.freeze([9000,700,220,80]);
export const recruitmentV2=s=>s?.featureVersion===6&&s?.season?.number>=FIRST_RECRUITMENT_SEASON&&s.season.recruitmentVersion===2;
export const recruitmentWeights=s=>recruitmentV2(s)?RECRUITMENT_WEIGHTS:LEGACY_RECRUITMENT_WEIGHTS;
export const exhaustedRecruitTier=(s,sides)=>recruitmentV2(s)&&sides===6?6:4;
export const recruitmentText=s=>recruitmentV2(s)?'D4 90% · D6 7% · D8 2.2% · D12 0.8%':'D4 90% · D6 7% · D8 2.5% · D12 0.5%';
export const exhaustedRecruitText=(s,sides)=>exhaustedRecruitTier(s,sides)===6?'이름 없는 D6 부장':'D4';
