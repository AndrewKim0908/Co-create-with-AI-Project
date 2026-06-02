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
      'The engineer and designer disagree on the tolerance spec for the mounting points.',
    content:
      'A conflict has arisen over the tolerance spec for the mounting points of EV Thermal Module A — between ±0.5mm and ±0.3mm. The engineer argues for ±0.5mm given manufacturing cost and mass-production efficiency, while the designer requires ±0.3mm for exterior quality and assembly precision.',
  },

  // 2. Positions
  positions: [
    {
      userId: 'user-1',
      userName: 'Andrew Kim',
      role: 'Engineer',
      titleSummary: 'Accept ±0.5mm tolerance',
      detailedPosition:
        'Maintaining a ±0.3mm tolerance in mass production would require additional equipment investment and inspection steps. ±0.5mm is reliably achievable on the current line and cuts manufacturing cost by about 15%. It also lowers the defect rate, improving overall efficiency.',
    },
    {
      userId: 'user-2',
      userName: 'Jonghun Kim',
      role: 'Designer',
      titleSummary: 'Require ±0.3mm tolerance',
      detailedPosition:
        'A ±0.3mm tolerance directly affects the visual quality and user experience of the product. Inconsistent gaps between modules reduce its value as a premium product and cannot guarantee smooth operation when users detach or assemble it. Precision is essential to the core value of eco-friendly modular design.',
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
      'A hybrid solution using a variable-hardness gasket (Shore A 45-62) that absorbs ±0.5mm variation while still meeting the ±0.3mm structural spec.',
    pros: [
      'Cost savings by allowing a ±0.5mm manufacturing tolerance',
      'Achieves ±0.3mm precision at final assembly',
      'Technology proven on EV-EN Module B',
    ],
    cons: [
      'Upfront gasket development cost',
      'Time needed for supplier selection and validation',
    ],
    alignmentReason:
      "Maintains the project North Star of an 'eco-friendly modular design' while balancing manufacturing efficiency (81% quality-first) and stability (81% stability-first).",
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
  message: 'More discussion is needed for AI analysis.',
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
  message: 'The AI needs more discussion on the following topics for a more accurate analysis:',
  suggestedTopics: [
    'Real-world operating environment of the mounting points (temperature, vibration, etc.)',
    'Cost constraints and budget limits',
    'Mass-production timing and launch schedule',
  ],
};
