// ═══════════════════════════════════════════════════════════
// gwp-registry.js — 고팡 서비스 자기 서술 레지스트리
// 버전: v1.0
// 작성일: 2026-06-03
// 작성자: AI City Inc. (팀 주피터)
//
// 설계 원칙:
//   - 각 서비스가 스스로 트리거·카테고리·URL을 등록
//   - 라우터(SP-00-ROUTER)는 이 레지스트리만 참조
//   - 신규 서비스 추가 = 이 파일에 항목 1개 추가
//   - 라우터 프롬프트 수정 불필요
//
// 등록 서비스: 16개 (gopang.net DNS 기준)
// ═══════════════════════════════════════════════════════════

const GWP_REGISTRY = [

  // ── 0. 긴급·재난 (EMG) ── 항상 최우선 ─────────────────────
  {
    id:          'kemergency',
    name:        'K-Emergency',
    category:    'EMG',
    url:         'https://911.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    0,   // 낮을수록 우선
    description: '긴급 구조·재난 대응 자동 디스패치. 119·112 연계.',
    triggers: [
      '긴급', '응급', '119', '112', '살려줘', '도와줘',
      '화재', '불났어', '불이야', '구조', '사고',
      '쓰러졌어', '쓰러진', '다쳤어', '피가', '부상',
      '심정지', '심폐소생', 'CPR', '익사', '빠졌어',
      '지진', '홍수', '재난', '태풍', '붕괴', '가스 누출',
      '빨리', '죽겠어', '위험해', '교통사고+부상',
    ],
  },

  // ── 1. 사법·법률 (JUS) ─────────────────────────────────────
  {
    id:          'klaw',
    name:        'K-Law',
    category:    'JUS',
    url:         'https://klaw.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    1,
    description: 'AI 가상 판결문. K-Law 방법론 v20.0. 1초·1,000원.',
    triggers: [
      '소송', '고소', '고발', '판결', '재판', '법원',
      '계약서', '계약 분쟁', '손해배상', '위법', '불법',
      '범죄', '형사', '민사', '이혼', '상속', '유류분',
      '전세보증금', '부당해고', '명예훼손', '저작권 침해',
      '사기', '횡령', '배임', '가처분', '변호사',
      '법률 자문', '판례', '헌법소원', '행정소송',
      '임금체불', '산재', '교통사고 과실',
      '법적으로', '합법인가', '불법인가', '법적 대응', '내용증명',
      '고소장', '소장', '항소', '상고', '형량', '처벌',
    ],
  },

  {
    id:          'kpolice',
    name:        'K-Police',
    category:    'JUS',
    url:         'https://police.gopang.net/webapp.html',
    minAuth:     'L1',
    pdv:         true,
    priority:    1,
    description: '실시간 범죄 예측·대응. 경찰청 연동.',
    triggers: [
      '경찰', '112 신고', '범죄 신고', '신고할게',
      '도둑', '절도', '폭행', '성범죄', '스토킹',
      '협박', '갈취', '무고', '체포', '고소 접수',
      '범죄 피해', '수사', '증거', '가정폭력', '폭력',
    ],
  },

  {
    id:          'ksecurity',
    name:        'K-Security',
    category:    'JUS',
    url:         'https://security.gopang.net/webapp.html',
    minAuth:     'L1',
    pdv:         true,
    priority:    1,
    description: '사이버 보안·개인정보 침해 대응. OpenHash 증거 보존.',
    triggers: [
      '해킹', '사이버 공격', '개인정보 유출', '피싱', '스미싱',
      '사기 문자', '보이스피싱', '사이버 범죄', '계정 탈취',
      '랜섬웨어', '악성코드', '보안 위협', '디지털 증거',
      '온라인 사기', '불법 거래', '다크웹',
    ],
  },

  // ── 2. 의료·보건 (MED) ─────────────────────────────────────
  {
    id:          'khealth',
    name:        'K-Health',
    category:    'MED',
    url:         'https://health.gopang.net/webapp.html',
    minAuth:     'L1',
    pdv:         true,
    priority:    2,
    description: '개인화 의료 분석·건강 위험도 산정. 건강보험공단 연동.',
    triggers: [
      '아파요', '아파', '아프다', '병원', '증상', '처방',
      '진단', '의사', '수술', '약', '건강', '의료', '치료',
      '검진', '통증', '열', '기침', '두통', '복통',
      '허리 통증', '혈압', '당뇨', '암', '만성 질환',
      '응급실', '입원', '외래', '처방전', '검사 결과',
      '예방접종', '백신', '정신 건강', '우울증', '불면증',
      '건강 상태', '건강 검진', '의료비',
    ],
  },

  // ── 3. 교육·연구 (EDU) ─────────────────────────────────────
  {
    id:          'kedu',
    name:        'K-School',
    category:    'EDU',
    url:         'https://school.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    3,
    description: 'AI 교수 1:1 전담. 유치원~대학원. 166개 과목.',
    triggers: [
      '학습', '교육', '학교', '공부', '시험', '강의', '수업',
      '자격증', '논문', '특허', '연구', '입학', '졸업',
      '진로', '직업', '취업', '과외', '학원', '튜터',
      '숙제', '과제', '리포트', '수능', '내신', '학점',
      '장학금', '전공', '교수', '학습법',
      'AI 대체', '미래 직업', '진로 상담',
      '초등', '중학', '고등', '대학', '대학원',
    ],
  },

  // ── 4. 금융·경제 (ECO) ─────────────────────────────────────
  {
    id:          'kgdc',
    name:        'GDC',
    category:    'ECO',
    url:         'https://gdc.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    4,
    description: 'GDC 지갑. 잔액·이체·예금·대출·환전·신용평가.',
    triggers: [
      // 잔액
      '잔액', '잔액 확인', '얼마 있어', '내 GDC', 'GDC 얼마',
      // 이체·송금
      '이체', '이체해줘', '송금', '보내줘', '전송', 'GDC 전송',
      // 예금·저축
      '예금', '저금', '적금', '이자', '정기예금', '요구불',
      // 대출
      '대출', '빌리다', '빌려줘', '대출 한도', '대출 신청',
      // 신용
      '신용등급', '신용평가', '신용점수', '신용 조회',
      // 환전·POOL
      '환전', 'FIAT', '달러로 바꿔', '엔화로', '위안화로',
      '국적 통화', 'FIAT POOL', '외환',
      // GDC 직접
      'GDC', '고팡 화폐', '디지털 화폐', 'GDC 충전', 'GDC 출금',
      'GDC 결제', '고팡 결제', '글로벌 결제',
    ],
  },

  {
    id:          'kfinance',
    name:        'K-Stock',
    category:    'ECO',
    url:         'https://stock.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    4,
    description: '89개 자산군 분석·포트폴리오·절세. CFA Black-Litterman.',
    triggers: [
      '주식', '투자', '포트폴리오', '자산관리', '재무',
      '주식 분석', 'ETF', '채권', '리츠', '부동산 투자',
      '암호화폐', '비트코인', '금', '원자재', '달러',
      '펀드', '리밸런싱', '절세', 'IRP', 'ISA', '연금',
      '배당주', '공모주', '수익률', '자산 배분',
      '금융소득종합과세', '종합소득세 절세', '양도세',
      '증권', '노후 준비', '은퇴 계획', '재테크',
      '레버리지', '대출 상환 전략', '자산 증식',
    ],
  },

  {
    id:          'kinsurance',
    name:        'K-Insurance',
    category:    'ECO',
    url:         'https://insurance.gopang.net/webapp.html',
    minAuth:     'L1',
    pdv:         true,
    priority:    4,
    description: '개인화 보험료 자동 산정·청구·심사·지급 자동화.',
    triggers: [
      '보험', '보험료', '보험 청구', '보험금', '의료비 청구',
      '실손보험', '자동차보험', '생명보험', '화재보험',
      '보험 가입', '보험 비교', '보험 계약',
      '보험 해지', '보험 환급',
    ],
  },

  {
    id:          'ktax',
    name:        'K-Tax',
    category:    'ECO',
    url:         'https://tax.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    4,
    description: '재무제표 자동 생성·세금 신고. 국세청·세관 연동.',
    triggers: [
      '세금 신고', '세무', '세무사', '부가세', '소득세',
      '법인세', '세금 계산', '종합소득세 신고', '연말정산',
      '환급', '세무조사', '관세', '수입세', '지방세',
      '재산세', '증여세', '상속세', '세금 납부',
      '국세청', '홈택스', '전자세금계산서',
    ],
  },

  // ── 5. 시장·거래 (MKT) ─────────────────────────────────────
  {
    id:          'kcommerce',
    name:        'K-Market',
    category:    'MKT',
    url:         'https://market.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    5,
    description: '판매자 이력 기반 수요 예측·공급망 자동화. GPID 글로벌 시장.',
    triggers: [
      '쇼핑', '구매', '주문', '상품', '가격',
      '식당', '음식', '반품', '교환', '거래',
      '시장', '판매', '공급', '유통', '마켓', '가게',
      '가격 비교', '중고거래', '직거래', '온라인쇼핑',
      '쿠폰', '할인', '부동산 거래', '예약',
    ],
  },

  // ── 6. 교통·물류 (TRN) ─────────────────────────────────────
  {
    id:          'ktransport',
    name:        'K-Traffic',
    category:    'TRN',
    url:         'https://traffic.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         false,
    priority:    6,
    description: '실시간 교통 흐름 예측·신호 최적화. 국토교통부 연동.',
    triggers: [
      '교통', '막히다', '정체', '우회', '신호', '도로',
      '교통 정보', '실시간 교통', '자율주행', '도로 상황',
      '최적 경로', '내비게이션', '버스', '지하철',
      '대중교통', '공항 교통', '주차', '주차장',
      '정류장', '운전 경로', '사고 우회',
    ],
  },

  {
    id:          'klogistics',
    name:        'K-Logistics',
    category:    'TRN',
    url:         'https://logistics.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    6,
    description: '주문-출고-배송-반품 전 과정 자동화. OpenHash 배송 증빙.',
    triggers: [
      '배송', '배달', '택배', '물류', '운송', '출고', '재고',
      '창고', '반품', '배송 추적', '배송 지연',
      '통관', '수출', '수입', '국제 배송', '관세',
      '화물', '공급망', '물류비',
      '새벽 배송', '당일 배송',
    ],
  },

  // ── 7. 환경·자원 (ENV) ─────────────────────────────────────
  {
    id:          'fiil-kcleaner',
    name:        'K-Cleaner',
    category:    'ENV',
    url:         'https://fiil.kr/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    7,
    description: '사진 한 장으로 쓰레기·불법 투기 AI 분석·신고.',
    triggers: [
      '쓰레기', '폐기물', '쓰레기 투기', '불법 투기',
      '해안 쓰레기', '해변 오염', '환경 신고', '오염 신고',
      '침적 쓰레기', '수거 요청', '해양 오염',
      '산림 오염', '도로변 쓰레기', '폐수', '불법 배출',
      '환경부 신고', '바다+쓰레기', '강+오염',
    ],
  },

  // ── 8. 정부행정 (GOV) ──────────────────────────────────────
  {
    id:          'kgov',
    name:        'K-Gov',
    category:    'GOV',
    url:         'https://public.gopang.net/webapp.html',
    minAuth:     'L0',
    pdv:         true,
    priority:    8,
    description: '민원·행정·허가 AI 자동 처리. 정부24·관공서 연동.',
    triggers: [
      '민원', '허가', '등본', '초본', '면허', '행정',
      '공무원', '시청', '도청', '구청', '행정안전부',
      '정부24', '발급', '증명서', '건축 허가',
      '사업자 등록', '전입신고', '세대 분리',
      '운전면허 갱신', '여권', '주민등록',
      '건강보험료', '국민연금', '고용보험', '관공서',
    ],
  },

  // ── 9. 입법·정책 (LEG) ─────────────────────────────────────
  {
    id:          'kdemocracy',
    name:        'K-Democracy',
    category:    'LEG',
    url:         'https://democracy.gopang.net/webapp.html',
    minAuth:     'L1',
    pdv:         true,
    priority:    9,
    description: '고팡 직접 민주주의 (DAWN). 안건 제안·투표·의결.',
    triggers: [
      '안건 제안', '투표', '의결', '고팡 투표권', 'GDC 투표',
      '고팡 운영', '수수료 인하', '서버 변경', '거버넌스',
      '배심원', '상원', '하원', '동의', '찬성', '반대', '발의',
      '고팡 규칙', '고팡 정책', '평행 법률',
      '평행 헌법', 'DAWN', '직접 민주주의',
      '고팡 안건', '고팡 의결', '고팡 시민',
    ],
  },

];

// ═══════════════════════════════════════════════════════════
// 유틸리티 함수
// ═══════════════════════════════════════════════════════════

/**
 * 사용자 입력 텍스트와 레지스트리를 매칭하여
 * 가장 적합한 서비스를 반환합니다.
 *
 * @param {string} input  사용자 입력 텍스트
 * @param {string} [gwpSvc]  GWP svc 파라미터 (있으면 직접 반환)
 * @returns {{ service, confidence, hits }}
 */
function matchService(input, gwpSvc = null) {
  // GWP svc 파라미터 직접 라우팅
  if (gwpSvc) {
    const direct = GWP_REGISTRY.find(s => s.id === gwpSvc);
    if (direct) return { service: direct, confidence: 0.99, hits: [] };
  }

  const normalized = input.toLowerCase();

  // 긴급 키워드 최우선
  const emg = GWP_REGISTRY.find(s => s.category === 'EMG');
  if (emg?.triggers.some(t => normalized.includes(t.toLowerCase()))) {
    return { service: emg, confidence: 0.99, hits: ['긴급'] };
  }

  // 전체 서비스 스코어링
  const scored = GWP_REGISTRY
    .filter(s => s.category !== 'EMG')
    .map(s => {
      const hits = s.triggers.filter(t => normalized.includes(t.toLowerCase()));
      // 히트 수 + 우선순위 가중치
      const score = hits.length * 10 - (s.priority || 9);
      return { service: s, score, hits };
    })
    .filter(r => r.hits.length > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { service: null, confidence: 0, hits: [] };
  }

  const best = scored[0];
  const confidence = Math.min(0.5 + best.hits.length * 0.12, 0.97);
  return { service: best.service, confidence, hits: best.hits };
}

/**
 * 서비스 ID로 레지스트리 항목 조회
 */
function getService(id) {
  return GWP_REGISTRY.find(s => s.id === id) || null;
}

/**
 * 카테고리별 서비스 목록 조회
 */
function getByCategory(category) {
  return GWP_REGISTRY.filter(s => s.category === category);
}

// ── 전역 노출 (classic script 호환) ──
window.GWP_REGISTRY  = GWP_REGISTRY;
window.gwpMatch      = gwpMatch;
window.getService    = getService;
window.getByCategory = getByCategory;
