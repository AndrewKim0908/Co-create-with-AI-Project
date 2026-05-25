/**
 * AI Analysis Mock 데이터
 * 실제 Gemini API 연동 전 UI 확인용
 */
export const mockAIAnalysisResult = {
  canAnalyze: true,

  // 1. Active Conflict
  activeConflict: {
    id: 'CF-01',
    title: 'Mounting Point Tolerance',
    summary:
      '엔지니어와 디자이너가 마운팅 포인트의 공차 기준에 대해 다른 의견을 가지고 있습니다.',
    content:
      'EV Thermal Module A의 마운팅 포인트에서 ±0.5mm와 ±0.3mm 사이의 공차 기준에 대한 갈등이 발생했습니다. 엔지니어는 제조 비용과 양산 효율성을 고려해 ±0.5mm를 주장하는 반면, 디자이너는 제품의 외관 품질과 조립 정밀도를 위해 ±0.3mm를 요구하고 있습니다.',
  },

  // 2. Positions
  positions: [
    {
      userId: 'user-1',
      userName: 'Andrew Kim',
      role: 'Engineer',
      titleSummary: 'Accept ±0.5mm tolerance',
      detailedPosition:
        '양산 단계에서 ±0.3mm 공차를 유지하려면 추가 설비 투자와 검사 공정이 필요합니다. ±0.5mm는 현재 라인에서 안정적으로 달성 가능하며, 제조 비용을 약 15% 절감할 수 있습니다. 또한 불량률도 낮아져 전체적인 효율성이 향상됩니다.',
    },
    {
      userId: 'user-2',
      userName: 'Jonghun Kim',
      role: 'Designer',
      titleSummary: 'Require ±0.3mm tolerance',
      detailedPosition:
        '±0.3mm 공차는 제품의 시각적 품질과 사용자 경험에 직결됩니다. 모듈 간 갭이 일정하지 않으면 프리미엄 제품으로서의 가치가 떨어지고, 사용자가 분리/조립 시 부드러운 동작을 보장할 수 없습니다. 환경 친화적 모듈러 디자인이라는 핵심 가치를 위해 정밀도가 필수입니다.',
    },
  ],

  // 3. Value Conflict Matrix (Radar Chart 데이터)
  valueMatrix: {
    axes: ['Aesthetics', 'Functionality', 'Cost', 'Quality', 'Speed', 'Stability'],
    // 북극성 기준 (프로젝트 설정값 반영)
    projectValues: [80, 75, 60, 90, 50, 85],

    // 각 참여자 입장의 점수 (AI가 분석)
    positionValues: [
      {
        userName: 'Andrew Kim',
        color: '#06b6d4', // cyan
        values: [50, 85, 90, 70, 75, 80],
      },
      {
        userName: 'Jonghun Kim',
        color: '#3b82f6', // blue
        values: [90, 70, 50, 95, 40, 75],
      },
    ],
  },

  // 4. Alternative Proposal
  alternative: {
    title: 'Adaptive Gasket System',
    description:
      'Variable-hardness gasket (Shore A 45-62)을 사용하여 ±0.5mm 변동을 흡수하면서도 ±0.3mm 구조 사양을 충족하는 하이브리드 솔루션입니다.',
    pros: [
      '제조 공차 ±0.5mm 허용으로 비용 절감',
      '최종 조립 시 ±0.3mm 정밀도 달성',
      'EV-EN Module B에서 검증된 기술',
    ],
    cons: [
      '초기 가스켓 개발 비용 발생',
      '공급업체 선정 및 검증 시간 필요',
    ],
    alignmentReason:
      "프로젝트의 북극성인 '환경 친화적 모듈러 디자인'을 유지하면서, 제조 효율성(81% 품질 우선)과 안정성(81% 안정성 우선)의 균형을 맞춥니다.",
    metrics: {
      leadTime: '+3d',
      riskDelta: '-72%',
      confidence: '91%',
    },
  },
};

/**
 * 채팅 부족 시 Mock 데이터
 */
export const mockInsufficientChat = {
  canAnalyze: false,
  reason: 'insufficient_chat',
  message: 'AI 분석을 위해 더 많은 대화가 필요합니다.',
  details: [
    {
      userName: 'Andrew Kim',
      currentCount: 1,
      required: 3,
    },
    {
      userName: 'Jonghun Kim',
      currentCount: 5,
      required: 3,
    },
  ],
};

/**
 * AI가 추가 정보 요청하는 Mock 데이터
 */
export const mockNeedMoreInfo = {
  canAnalyze: false,
  reason: 'need_more_context',
  message: 'AI가 더 정확한 분석을 위해 다음 주제에 대한 대화가 필요합니다:',
  suggestedTopics: [
    '마운팅 포인트의 실제 사용 환경 (온도, 진동 등)',
    '비용 제약 사항과 예산 한도',
    '양산 시점과 출시 일정',
  ],
};
