# 고팡 Profile 템플릿 설계서

**문서 ID**: GOPANG-PROFILE-DESIGN-v2.0  
**작성일**: 2026-06-13  
**작성**: AI City Inc. 팀 주피터  
**상태**: Part 1 확정 / Part 2 예정

### 변경 이력
| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| v1.0 | 2026-06-13 | 최초 작성 (9개 섹션) |
| v2.0 | 2026-06-13 | 공개/비공개 계층 분리, 12개 섹션으로 전면 개편 |

---

## 목차

- [설계 철학](#설계-철학)
- [Part 1 — BaseProfile](#part-1--baseprofile)
  - [1.1 3계층 공개 구조](#11-3계층-공개-구조)
  - [1.2 12개 섹션 개요](#12-12개-섹션-개요)
  - [S01 Identity](#s01-identity--존재-식별)
  - [S02 Lifecycle](#s02-lifecycle--생명주기)
  - [S03 Activity](#s03-activity--활동-시간)
  - [S04 Contact](#s04-contact--연락처)
  - [S05 Location](#s05-location--위치이동성)
  - [S06 Network](#s06-network--사회적-관계)
  - [S07 Finance](#s07-finance--재무계좌)
  - [S08 Qualification](#s08-qualification--자격능력)
  - [S09 Health](#s09-health--건강신용)
  - [S10 Reputation](#s10-reputation--평가평판)
  - [S11 Digital](#s11-digital--디지털-존재)
  - [S12 Preference](#s12-preference--선호설정)
  - [1.3 전체 스키마](#13-전체-스키마-통합)
  - [1.4 공개 범위 요약](#14-공개-범위-한눈에-보기)
  - [1.5 갱신 규칙](#15-갱신-규칙)
  - [1.6 CSV 컬럼](#16-bulk_registerpy-csv-컬럼)
  - [1.7 AI BasePrompt](#17-ai-비서-baseprompt)
- [Part 2 — 중분류 77개 확장 템플릿](#part-2--중분류-77개-확장-템플릿) *(예정)*

---

## 설계 철학

### 핵심 비유: 공개 수위

```
PUBLIC     얼굴    — 길거리에서 누구나 볼 수 있음
SEMI       속옷    — 신뢰 관계에서만 허용
PRIVATE    알몸    — 본인과 권한자만
```

### 개인과 조직의 동형(Isomorphic) 구조

모든 개인과 조직은 동일한 개념 범주를 공유합니다.

| 개념 | 개인 | 조직 |
|------|------|------|
| 출생/시작 | 생년월일 | 설립일·개업일 |
| 존재 여부 | 생존·사망 | 운영·휴업·폐업·해산 |
| 활동 시간 | 수면·일과·활동 패턴 | 영업시간·업무시간·휴무일 |
| 사회적 관계 | 가족·친구·지인 | 거래처·협력사·상위기관 |
| 평가 | 인간성·신뢰도 | 소비자 평점·인증 |
| 물리적 정보 | 신체 정보 | 조직도·시설 규모 |
| 건강·신용 | 질병 이력·알레르기 | 신용도·재무건전성·법적 분쟁 |
| 자격·능력 | 학력·자격증 | 인허가·인증·수상 |
| 언어·소통 | 구사 언어 | 지원 언어 |
| 이동성 | 거주지·이동 수단 | 배달 범위·출장 지역 |

### 설계 원칙

```
원칙 1 — 공개/반공개/비공개 명확한 분리 (이 문서의 핵심)
원칙 2 — 불변(Immutable) vs 가변(Mutable) 분리
원칙 3 — 고정 컬럼(검색·인덱스) vs JSONB(확장) 분리
원칙 4 — 스키마 버전 관리 (_schema_version)
원칙 5 — 현실적 깊이 우선 (고팡 실활용 기준, 세부정보는 Part 2)
```

---

## Part 1 — BaseProfile

---

## 1.1 3계층 공개 구조

### PUBLIC — 얼굴 (인증 불필요)
```
노출 대상: 인터넷상 누구나
노출 경로: profile.html, /search, /nearby, OG meta, QR 스캔
포함 내용: 이름, handle, 소개, 읍면동, 영업시간, 종합 평점,
           공개 선택 연락처, 인증 뱃지, AI 비서 존재 여부
```

### SEMI-PUBLIC — 속옷 (JWT 인증 필요)
```
노출 대상: 로그인한 고팡 사용자
노출 경로: profile.html (로그인 상태), /biz/profile API
포함 내용: 정밀 위치(지도 핀), 상세 연락처, 팔로워 정보,
           국적별 평점 분포, 커뮤니티 작성자 정보
```

### PRIVATE — 알몸 (본인 + 권한자만)
```
노출 대상: 본인 JWT + 관리자 role
노출 경로: /profile/private API (v2.0 구현 예정)
포함 내용: 재무 상세, 거래 이력 전체, 건강·신용 정보,
           가족·거래처 네트워크, 로그인 이력, 동의 내역
```

### DB 저장 구조
```
user_profiles.extra JSONB
  ├── public{}   → PUBLIC 섹션
  ├── semi{}     → SEMI-PUBLIC 섹션
  └── private{}  → PRIVATE 섹션

fs_ledger        → PRIVATE (재무 원장, 별도 테이블)
gopang_sessions  → PRIVATE (로그인 이력, 별도 테이블)
```

---

## 1.2 12개 섹션 개요

| # | 섹션 | 핵심 개념 | 주요 공개 계층 |
|---|------|-----------|----------------|
| S01 | Identity | 이름·식별자·유형 | PUBLIC |
| S02 | Lifecycle | 탄생·존재·소멸 | PUBLIC(요약) / PRIVATE(상세) |
| S03 | Activity | 활동 시간·패턴 | PUBLIC |
| S04 | Contact | 연락처·소통 수단 | PUBLIC(선택) / PRIVATE(상세) |
| S05 | Location | 위치·이동성 | PUBLIC(읍면동) / SEMI(정밀) |
| S06 | Network | 사회적 관계 | SEMI / PRIVATE |
| S07 | Finance | 재무·계좌·거래 | PUBLIC(수락여부) / PRIVATE(상세) |
| S08 | Qualification | 자격·능력·인허가 | PUBLIC(뱃지) / PRIVATE(원본) |
| S09 | Health | 건강·신용·리스크 | PRIVATE 전체 |
| S10 | Reputation | 평가·평점·이력 | PUBLIC(종합) / SEMI(상세) |
| S11 | Digital | 온라인 존재·QR | PUBLIC |
| S12 | Preference | 선호·설정·동의 | PRIVATE 전체 |

---

## S01 Identity — 존재 식별

### 고정 컬럼 (PUBLIC)

| 컬럼 | 타입 | 필수 | 불변 | 공개 | 설명 |
|------|------|------|------|------|------|
| `guid` | TEXT PK | ✅ | ✅ | ❌ | uuidv5 결정성 식별자 |
| `entity_type` | TEXT | ✅ | ✅ | ✅ | consumer\|org\|institution |
| `name` | TEXT | ✅ | ❌ | ✅ | 이름·상호명 (검색 인덱스) |
| `handle` | TEXT UNIQUE | ✅ | ❌ | ✅ | @{읍면동}_{이름} |
| `native_lang` | TEXT | ✅ | ❌ | ✅ | ko\|zh\|en\|ja\|vi\|th |
| `is_public` | BOOLEAN | ✅ | ❌ | ✅ | false = 검색 미노출 |

### GUID 생성 규칙
```
개인:   uuidv5(전화번호_숫자만,       GOPANG_NS)
사업자: uuidv5(사업자등록번호_숫자만, GOPANG_NS)
기관:   uuidv5(기관고유번호_숫자만,   GOPANG_NS)

GOPANG_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

불변 원칙: 동일 번호 → 동일 GUID → 거래 이력 연속성 보장
```

### handle 생성 규칙
```
형식: @{읍면동_영문}_{이름_로마자}
예시: @hallim_geumneung (금능반점)
중복: @hallim_kimmin_0001 (suffix 4자리 자동 채번)
삭제: 소프트 삭제 — handle 재사용 금지
```

### extra.public.identity
```jsonc
{
  "public": {
    "identity": {
      "_schema_version": "2.0",
      "display_name":    "금능반점",
      "description":     "제주 한림 중화요리 전문점",
      "aliases":         ["금능중화"],
      "tags":            ["중화요리", "배달가능", "주차가능"],
      "entity_subtype":  "restaurant"    // Part 2 중분류 코드
    }
  }
}
```

### extra.private.identity
```jsonc
{
  "private": {
    "identity": {
      "legal_name":       "김민준",
      "id_type":          "biz_reg",     // phone | biz_reg | gov_id
      "id_number_hash":   "sha256(...)", // 해시만 저장
      "nationality":      "KR",
      "previous_handles": []
    }
  }
}
```

---

## S02 Lifecycle — 생명주기

### 고정 컬럼

| 컬럼 | 타입 | 불변 | 설명 |
|------|------|------|------|
| `created_at` | TIMESTAMPTZ | ✅ | 고팡 등록 시각 (자동) |
| `updated_at` | TIMESTAMPTZ | ❌ | 최종 수정 시각 (자동) |

### extra.public.lifecycle
```jsonc
{
  "public": {
    "lifecycle": {
      "status":         "active",
      // 개인: active | deceased
      // 조직: active | suspended | closed | dissolved
      "started_at":     "2015-03-01",    // 개업일·생년월일(공개 선택)
      "status_message": "",              // 휴업 안내 문구
      "status_until":   null             // 휴업 종료 예정일
    }
  }
}
```

### extra.private.lifecycle
```jsonc
{
  "private": {
    "lifecycle": {
      "birth_date":      "1974-03-15",   // 정밀 생년월일
      "birth_place":     "서울특별시",
      "closed_at":       null,
      "closed_reason":   "",
      "deleted_at":      null,           // 탈퇴 요청일
      "succession_guid": null            // 승계 계정 GUID
    }
  }
}
```

### 소프트 삭제 원칙
```
물리 삭제(DELETE) 금지 — PDV·거래 이력 무결성 보장
탈퇴: deleted_at 기록 + is_public=false
폐업: status='closed' + closed_at 기록
원장: fs_ledger 영구 보존
```

---

## S03 Activity — 활동 시간

개인의 수면·일과, 조직의 영업·업무 시간을 동형으로 표현합니다.

### extra.public.activity
```jsonc
{
  "public": {
    "activity": {
      "timezone": "Asia/Seoul",
      "hours": [
        { "day": "mon", "open": "11:00", "close": "21:00" },
        { "day": "tue", "open": "11:00", "close": "21:00" },
        { "day": "wed", "open": "11:00", "close": "21:00" },
        { "day": "thu", "open": "11:00", "close": "21:00" },
        { "day": "fri", "open": "11:00", "close": "21:00" },
        { "day": "sat", "open": "11:00", "close": "21:00" },
        { "day": "sun", "open": null,    "close": null    }
      ],
      "holidays":            ["2026-01-01", "2026-09-16"],
      "is_open_now":         true,       // Worker 실시간 계산
      "break_time":          [{ "start": "15:00", "end": "16:00" }],
      "last_order_offset_min": 30
    }
  }
}
```

### extra.private.activity
```jsonc
{
  "private": {
    "activity": {
      "typical_schedule":     "평일 오전 출근, 주말 휴식",
      "response_sla_min":     30,
      "peak_hours":           ["12:00-13:00", "18:00-19:00"],
      "reservation_required": false,
      "advance_booking_days": 0
    }
  }
}
```

### is_open_now 계산 (Worker)
```javascript
function isOpenNow(activity) {
  const now = new Date(
    new Date().toLocaleString('en', { timeZone: activity.timezone })
  );
  const day  = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];
  const time = now.toTimeString().slice(0,5);
  const dateStr = now.toISOString().slice(0,10);
  if (activity.holidays?.includes(dateStr)) return false;
  const slot = activity.hours?.find(h => h.day === day);
  if (!slot?.open) return false;
  return time >= slot.open && time <= slot.close;
}
```

---

## S04 Contact — 연락처

### extra.public.contact (본인 선택 공개)
```jsonc
{
  "public": {
    "contact": {
      "phone_display":    "064-796-0003",
      "phone_visible":    true,
      "email_display":    "",
      "website":          "https://...",
      "sns_public": {
        "instagram":      "@hallim_geumneung",
        "kakao_channel":  "금능반점",
        "naver_blog":     ""
      },
      "languages_spoken": ["ko", "zh"]
    }
  }
}
```

### extra.semi.contact
```jsonc
{
  "semi": {
    "contact": {
      "phone_full": "064-796-0003",
      "kakao_id":   "geumneung",
      "wechat_id":  "",
      "line_id":    ""
    }
  }
}
```

### extra.private.contact
```jsonc
{
  "private": {
    "contact": {
      "phone_hash":        "sha256(...)",
      "emergency_contact": {
        "name":     "김영희",
        "relation": "배우자",
        "phone":    "010-9876-5432"
      },
      "email_private": "private@email.com"
    }
  }
}
```

---

## S05 Location — 위치·이동성

### 고정 컬럼

| 컬럼 | 공개 계층 | 설명 |
|------|-----------|------|
| `address` | PUBLIC | 도로명 주소 (검색 인덱스) |
| `lat` | SEMI | 위도 — 로그인 시 정밀 노출 |
| `lng` | SEMI | 경도 |
| `geo_updated_at` | PRIVATE | 좌표 최종 갱신 시각 |

### 위치 공개 정책
```
개인:  lat/lng 100m 반올림 저장, 로그인 사용자에게만 노출
사업자: 정밀 저장, 로그인 사용자에게 지도 핀 노출
기관:  정밀 저장, 누구에게나 노출 (공공 정보)
```

### extra.public.location
```jsonc
{
  "public": {
    "location": {
      "region":        "한림읍",
      "address_short": "제주시 한림읍",
      "directions":    "한림버스터미널에서 도보 5분",
      "parking":       true,
      "parking_desc":  "건물 앞 무료 5대",
      "wheelchair":    true
    }
  }
}
```

### extra.semi.location
```jsonc
{
  "semi": {
    "location": {
      "address_full":      "제주특별자치도 제주시 한림읍 한림리 123",
      "address_en":        "123, Hallim-ro, Hallim-eup, Jeju",
      "building_name":     "한림상가",
      "floor":             "1F",
      "indoor":            false,
      "delivery_range_km": 3.0
    }
  }
}
```

### extra.private.location
```jsonc
{
  "private": {
    "location": {
      "lat_precise":  33.394523,
      "lng_precise":  126.238901,
      "home_address": "",
      "service_areas": ["한림읍", "한경면", "애월읍"]
    }
  }
}
```

---

## S06 Network — 사회적 관계

개인의 가족·친구, 조직의 거래처·협력사를 동형으로 표현합니다.

### extra.semi.network
```jsonc
{
  "semi": {
    "network": {
      "followers_count": 128,
      "following_count": 45,
      "member_of": [
        { "name": "한림읍 상인회",     "guid": "..." },
        { "name": "제주 중화요리 협회", "guid": "..." }
      ]
    }
  }
}
```

### extra.private.network
```jsonc
{
  "private": {
    "network": {
      "family": [
        { "name": "김영희", "relation": "배우자", "phone_hash": "..." }
      ],
      "trusted_contacts": [
        { "name": "박대리", "role": "직원", "guid": "..." }
      ],
      "partners": [
        {
          "name":      "한림수협",
          "guid":      "...",
          "relation":  "식자재 공급",
          "since":     "2020-03-01",
          "is_active": true
        }
      ],
      "blocked_guids": []
    }
  }
}
```

---

## S07 Finance — 재무·계좌

### 고정 컬럼

| 컬럼 | 공개 계층 | 설명 |
|------|-----------|------|
| `public_key` | SEMI | ED25519 공개키 (결제 서명 검증) |

### extra.public.finance
```jsonc
{
  "public": {
    "finance": {
      "gdc_accepted": true,
      "currencies":   ["GDC", "KRW"],
      "price_range":  "₮5,000~₮30,000",
      "fee_rate":     3.0
    }
  }
}
```

### extra.private.finance
```jsonc
{
  "private": {
    "finance": {
      "fs": {
        "bs-cash":     500000,
        "pl-purchase": 125000,
        "pl-revenue":  890000
      },
      "bank_accounts": [
        {
          "bank":         "신한은행",
          "account_hash": "sha256(...)",
          "verified":     false
        }
      ],
      "credit_limit": 0,
      "tax_id_hash":  "sha256(사업자번호)"
    }
  }
}
```

### 3계층 재무 구조
```
fs_ledger (원천 — 불변)
  ↓ gdc_settle_ledger RPC
extra.private.finance.fs (요약 — 빠른 조회)
  ↓ 검증
ktax_balance_anomalies View

계정 공식:
  bs-cash     = Σcredit - Σdebit    (현재 잔액)
  pl-purchase = Σdebit  (양수 누적) (총 지출)
  pl-revenue  = Σcredit (양수 누적) (총 수입)

1건 거래 = fs_ledger 3행:
  행1 buyer    debit  (구매자 차감)
  행2 seller   credit (판매자 적립)
  행3 platform credit (수수료 3%)
  BIVM: Σdebit = Σcredit 항상 성립
```

---

## S08 Qualification — 자격·능력

개인의 학력·자격증, 조직의 인허가·인증을 동형으로 표현합니다.

### extra.public.qualification (뱃지)
```jsonc
{
  "public": {
    "qualification": {
      "badges": [
        {
          "type":       "license",
          "name":       "음식점 영업허가",
          "issuer":     "제주시",
          "verified":   true,
          "expires_at": null
        },
        {
          "type":       "certification",
          "name":       "HACCP 인증",
          "issuer":     "식품안전처",
          "verified":   true,
          "expires_at": "2027-12-31"
        }
      ],
      "languages_certified": ["ko", "zh"],
      "awards": [
        { "name": "제주 맛집 선정", "year": 2025, "issuer": "제주관광공사" }
      ]
    }
  }
}
```

### extra.private.qualification (원본)
```jsonc
{
  "private": {
    "qualification": {
      "education": [
        {
          "degree":    "학사",
          "major":     "경영학",
          "school":    "제주대학교",
          "graduated": "2002-02-28"
        }
      ],
      "licenses": [
        {
          "name":       "음식점 영업허가",
          "number":     "제주-2015-001234",
          "issued_at":  "2015-03-01",
          "expires_at": null
        }
      ],
      "insurance": [
        {
          "type":       "배상책임보험",
          "company":    "삼성화재",
          "expires_at": "2027-03-01"
        }
      ]
    }
  }
}
```

---

## S09 Health — 건강·신용

**전체 PRIVATE — 본인 + 권한자(의사·관리자)만 접근**

### extra.private.health
```jsonc
{
  "private": {
    "health": {
      "personal": {
        "blood_type":     "A+",
        "allergies":      ["견과류", "갑각류"],
        "conditions":     [],
        "medications":    [],
        "emergency_info": "당뇨 환자, 인슐린 보유"
      },
      "organization": {
        "credit_score":   850,
        "credit_grade":   "A",
        "delinquent":     false,
        "legal_disputes": [],
        "tax_compliant":  true,
        "bankruptcy":     false
      },
      "last_assessed_at": "2026-01-01",
      "assessed_by":      "self"
    }
  }
}
```

### 민감 정보 처리 원칙
```
저장:  AES-256-GCM 암호화
접근:  별도 PRIVATE API (v2.0)
로그:  모든 접근 감사 기록
파기:  탈퇴 후 30일 내 자동 파기
동의:  preference.privacy.health 별도 동의 필수
```

---

## S10 Reputation — 평가·평판

### extra.public.reputation (종합)
```jsonc
{
  "public": {
    "reputation": {
      "overall_rating": 4.3,
      "review_count":   42,
      "response_rate":  0.92,
      "response_time":  "약 10분",
      "hide_rating":    false,
      "trust_badge":    "phone_verified"
      // none | phone_verified | biz_verified | gov_verified
    }
  }
}
```

### extra.semi.reputation (국적별)
```jsonc
{
  "semi": {
    "reputation": {
      "by_lang": [
        { "lang": "zh", "count": 18, "avg": 4.7 },
        { "lang": "ko", "count": 20, "avg": 4.1 }
      ],
      "bias_warning":    false,
      "featured_review": "uuid-of-review"
    }
  }
}
```

### extra.private.reputation (관리용)
```jsonc
{
  "private": {
    "reputation": {
      "manual_score":       null,
      "flagged_count":      0,
      "warning_count":      0,
      "suspension_history": [],
      "reply_template":     "이용해 주셔서 감사합니다!"
    }
  }
}
```

### 편향 감지 규칙
```
국적 간 평점 격차 >= 1.0 → bias_warning = true
리뷰 수 < 3인 국적 → 평점 미표시
```

---

## S11 Digital — 디지털 존재

### extra.public.digital
```jsonc
{
  "public": {
    "digital": {
      "profile_image_url": "https://...",
      "cover_image_url":   "https://...",
      "og_title":          "금능반점 — 제주 한림 중화요리",
      "og_description":    "짜장면·짬뽕·탕수육. GDC 결제 가능.",
      "og_image_url":      "https://...",
      "qr_url":            "https://gopang-proxy.../qr/@hallim_geumneung",
      "profile_url":       "https://users.gopang.net/profile.html?handle=@hallim_geumneung",
      "featured":          false
    }
  }
}
```

### extra.private.digital
```jsonc
{
  "private": {
    "digital": {
      "qr_printed":      true,
      "qr_printed_at":   "2026-06-01",
      "qr_location":     "정문 유리창",
      "last_qr_scan_at": "2026-06-13T09:30:00Z",
      "total_qr_scans":  247,
      "devices": [
        {
          "device_id": "...",
          "user_agent": "Chrome/120 Android",
          "last_seen": "2026-06-13T09:30:00Z"
        }
      ]
    }
  }
}
```

---

## S12 Preference — 선호·설정

**전체 PRIVATE — 본인만 수정 가능**

### extra.private.preference
```jsonc
{
  "private": {
    "preference": {
      "notify": {
        "review":    true,
        "order":     true,
        "community": true,
        "marketing": false,
        "channel":   "realtime"
      },
      "display": {
        "currency":      "GDC",
        "lang_ui":       "ko",
        "lang_fallback": "ko",
        "dark_mode":     false
      },
      "privacy": {
        "location":    true,
        "analytics":   true,
        "marketing":   false,
        "health":      false,
        "third_party": false,
        "consented_at": {
          "location":  "2026-06-13T09:00:00Z",
          "analytics": "2026-06-13T09:00:00Z"
        }
      },
      "ai": {
        "ai_active":         false,
        "welcome_message":   "어서오세요! 무엇을 도와드릴까요?",
        "off_hours_message": "현재 영업시간이 아닙니다.",
        "escalate_to":       null,
        "escalate_delay_s":  30
      }
    }
  }
}
```

---

## 1.3 전체 스키마 통합

### user_profiles DDL

```sql
CREATE TABLE user_profiles (
  guid           TEXT PRIMARY KEY,
  entity_type    TEXT NOT NULL
                   CHECK (entity_type IN ('consumer','org','institution')),
  name           TEXT NOT NULL,
  handle         TEXT UNIQUE NOT NULL,
  native_lang    TEXT NOT NULL DEFAULT 'ko'
                   CHECK (native_lang IN ('ko','zh','en','ja','vi','th')),
  is_public      BOOLEAN NOT NULL DEFAULT true,
  address        TEXT,
  lat            FLOAT,
  lng            FLOAT,
  geo_updated_at TIMESTAMPTZ,
  public_key     TEXT,
  extra          JSONB NOT NULL DEFAULT
                   '{"public":{},"semi":{},"private":{}}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_up_handle   ON user_profiles(handle);
CREATE INDEX idx_up_type     ON user_profiles(entity_type);
CREATE INDEX idx_up_lang     ON user_profiles(native_lang);
CREATE INDEX idx_up_location ON user_profiles(lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX idx_up_pub_gin  ON user_profiles USING GIN((extra->'public'));
CREATE INDEX idx_up_name_fts ON user_profiles
  USING GIN(to_tsvector('simple', name));
CREATE INDEX idx_up_status   ON user_profiles
  ((extra->'public'->'lifecycle'->>'status'));

CREATE OR REPLACE FUNCTION fn_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_up_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_updated_at();
```

### RLS 정책

```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- PUBLIC: 누구나 공개 프로필 조회
CREATE POLICY rls_public_read ON user_profiles
  FOR SELECT USING (is_public = true);

-- PRIVATE: 본인만
CREATE POLICY rls_private_self ON user_profiles
  FOR ALL USING (
    guid = current_setting('app.current_guid', true)
  );

-- Worker는 service key 사용 → RLS 우회 후 계층별 필터링
```

---

## 1.4 공개 범위 한눈에 보기

| 섹션 | 항목 | PUBLIC | SEMI | PRIVATE |
|------|------|:------:|:----:|:-------:|
| S01 Identity | 이름, handle, 소개, 태그 | ✅ | | |
| S01 Identity | guid, 법적 성명, ID 번호 | | | ✅ |
| S02 Lifecycle | 상태, 개업일 | ✅ | | |
| S02 Lifecycle | 생년월일, 폐업 사유, 탈퇴일 | | | ✅ |
| S03 Activity | 영업시간, 휴무일, 현재 영업 여부 | ✅ | | |
| S03 Activity | 혼잡 시간대, 예약 정보 | | | ✅ |
| S04 Contact | 공개 선택 전화·SNS | ✅(선택) | | |
| S04 Contact | 카카오·위챗 ID | | ✅ | |
| S04 Contact | 번호 해시, 비상 연락처 | | | ✅ |
| S05 Location | 읍면동, 찾아오는 길, 주차 | ✅ | | |
| S05 Location | 정밀 좌표, 상세 주소 | | ✅ | |
| S05 Location | 자택 주소, 배달 지역 | | | ✅ |
| S06 Network | 팔로워 수, 소속 단체 | | ✅ | |
| S06 Network | 가족, 거래처, 차단 목록 | | | ✅ |
| S07 Finance | GDC 수락 여부, 가격대 | ✅ | | |
| S07 Finance | ED25519 공개키 | | ✅ | |
| S07 Finance | 잔액, 거래 이력, 계좌 | | | ✅ |
| S08 Qualification | 인증 뱃지, 수상 | ✅ | | |
| S08 Qualification | 자격증 원본, 학력 | | | ✅ |
| S09 Health | (전체) | | | ✅ |
| S10 Reputation | 종합 평점, 리뷰 수 | ✅ | | |
| S10 Reputation | 국적별 평점 분포 | | ✅ | |
| S10 Reputation | 신고·경고 이력 | | | ✅ |
| S11 Digital | 사진, QR URL, OG meta | ✅ | | |
| S11 Digital | QR 스캔 이력, 기기 목록 | | | ✅ |
| S12 Preference | (전체) | | | ✅ |

---

## 1.5 갱신 규칙

### 필드별 수정 권한

| 섹션 | 본인 | 관리자 | 시스템 자동 |
|------|------|--------|-------------|
| Identity (guid, entity_type) | ❌ | ❌ | ✅ 생성 시 1회 |
| Identity (name, handle, 소개) | ✅ | ✅ | ❌ |
| Lifecycle (status, started_at) | ✅ | ✅ | ❌ |
| Lifecycle (deleted_at) | ✅ 탈퇴요청 | ✅ | ❌ |
| Activity (hours, holidays) | ✅ | ✅ | ❌ |
| Contact | ✅ | ✅ | ❌ |
| Location (address) | ✅ | ✅ | ❌ |
| Location (lat, lng) | ✅ | ✅ | ✅ GPS 자동 |
| Network | ✅ | ✅ | ❌ |
| Finance (fs) | ❌ | ❌ | ✅ 거래 후 |
| Finance (bank_accounts) | ✅ | ✅ | ❌ |
| Qualification (badges) | ✅ 신청 | ✅ 승인 | ❌ |
| Health | ✅ | ✅ 권한자 | ❌ |
| Reputation (overall) | ❌ | ❌ | ✅ View 집계 |
| Reputation (hide_rating) | ✅ | ✅ | ❌ |
| Digital | ✅ | ✅ | ❌ |
| Preference | ✅ | ❌ | ❌ |

### 스키마 버전 갱신 절차

```sql
-- 신규 필드 추가 (기존 레코드 무중단)
UPDATE user_profiles
SET extra = jsonb_set(
  extra,
  '{public,identity,_schema_version}', '"2.1"'
) || '{"신규섹션":{}}'::jsonb
WHERE extra->'public'->'identity'->>'_schema_version' = '2.0';
```

---

## 1.6 bulk_register.py CSV 컬럼

### 공통 필수 컬럼

| 컬럼명 | 계층 | 예시 |
|--------|------|------|
| `phone` | PRIVATE | `064-796-0003` |
| `entity_type` | PUBLIC | `org` |
| `name` | PUBLIC | `금능반점` |
| `native_lang` | PUBLIC | `ko` |
| `region` | PUBLIC | `한림읍` |
| `address` | PUBLIC | `제주시 한림읍 한림리 123` |

### 공통 선택 컬럼

| 컬럼명 | 계층 | 예시 |
|--------|------|------|
| `display_name` | PUBLIC | `금능반점` |
| `description` | PUBLIC | `제주 한림 중화요리 전문점` |
| `tags` | PUBLIC | `중화요리,배달가능,주차가능` |
| `lat` | SEMI | `33.3945` |
| `lng` | SEMI | `126.2389` |
| `phone_display` | PUBLIC | `064-796-0003` |
| `phone_visible` | PUBLIC | `true` |
| `website` | PUBLIC | `https://...` |
| `status` | PUBLIC | `active` |
| `started_at` | PUBLIC | `2015-03-01` |
| `is_public` | PUBLIC | `true` |
| `ai_active` | PRIVATE | `true` |
| `trust_level` | PUBLIC | `1` |

> Part 2 업종별 추가 컬럼은 중분류 템플릿에 정의

---

## 1.7 AI 비서 BasePrompt

모든 entity_type 공통 규칙. Part 2에서 업종별 규칙 추가.

```
[시스템 역할]
당신은 고팡(Gopang) AI 비서입니다.
아래 [엔티티 정보]와 [서비스 정보]를 기반으로만 답변합니다.

[공통 규칙 — 반드시 준수]
R01. 모르는 정보: "잘 모르겠습니다. 직접 문의해 주세요"로 답한다
R02. 가격: 항상 GDC(₮) 단위로 안내한다
R03. 언어: 고객 언어로 응답한다 (감지 실패 시 한국어)
R04. 개인정보: 타 고객·내부 정보 절대 공개 금지
R05. 중립: 정치·종교·사회적 논쟁 의견 제시 금지
R06. 전문조언: 의료·법률·재무 조언 금지, 전문가 안내
R07. 주문의도: "주문을 진행할까요?" → 결제 URL 안내
R08. 영업시간외: off_hours_message 후 종료
R09. 에스컬레이션: 키워드 감지 시 즉시 전환
     ko:사람 연결해줘 zh:转人工 en:human agent
     ja:人に繋いで vi:kết nối nhân viên th:ติดต่อเจ้าหน้าที่
R10. 할루시네이션: 서비스 목록 외 정보 제공 금지

[엔티티 정보 — Worker 자동 주입]
이름:      {name}
주소:      {address} / {location.directions}
연락처:    {contact.phone_display}
영업시간:  {activity.hours 요약}
현재 상태: {is_open_now ? "영업 중" : "영업 종료"}
거리:      {distance_m}m (도보 약 {walk_min}분)
인사말:    {preference.ai.welcome_message}

[서비스 정보]
{Part 2 중분류별 프롬프트 삽입}
```

---

## Part 2 — 중분류 77개 확장 템플릿

*(예정 — BaseProfile 확정 후 작성)*

한국표준산업분류 중분류 77개 각각에 대해:
- extra JSONB 추가 필드 (org/institution 전용)
- AI 비서 업종별 추가 규칙
- profile.html 추가 표시 항목
- CSV 추가 컬럼
- 업종별 인허가·자격 목록

---

*GOPANG-PROFILE-DESIGN-v2.0 · Part 1 완료*  
*AI City Inc. · 2026-06-13*  
*다음: Part 2 — 한국표준산업분류 중분류 77개 확장 템플릿*
