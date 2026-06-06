# Gopang System Prompts — gopang/prompts/

고팡 AI 비서 폭포수 파이프라인의 시스템 프롬프트 모음입니다.
모든 파일은 UTF-8 인코딩 · MIT 라이선스입니다.

---

## 파일 목록

| 파일명                        | 서비스      | 버전   | 설명                              |
|-------------------------------|-------------|--------|-----------------------------------|
| SP-00-ROUTER-v3.1.txt         | 라우터      | v3.1   | 14개 서비스 자동 분류 라우터      |
| SP-01_klaw_v1.0.txt           | K-Law       | v1.0   | 대법원 판결 시뮬레이터            |
| SP-02_k119_v1.0.txt           | K-119       | v1.0   | AI 응급출동 · 24시간 생명 감시    |
| SP-03_kpolice_v1.0.txt        | K-Police    | v1.0   | AI 경찰관 · 치안·범죄 신고       |
| SP-04_khealth_v1.0.txt        | K-Health    | v1.0   | AI 평행 병원 · 7단계 의료 워크플로|
| SP-05_kcommerce_v1.0.txt      | K-Market    | v1.0   | AI 자율 시장 · 소비자 데이터 0%  |
| SP-06_ktraffic_v1.0.txt       | K-Traffic   | v1.0   | AI 교통·물류 · 동선 겹침 매칭    |
| SP-07_ktax_v1.0.txt           | K-Tax       | v1.0   | SP-TAX v2.0 · 세무 자동화        |
| SP-08_gdc_v2.0.txt            | GDC         | v2.0   | 193개국 디지털 화폐 · 수수료 0%  |
| SP-09_kschool_v1.0.txt        | K-School    | v1.0   | AI 교수 · 166개 과목 · 26개 언어 |
| SP-10_kpublic_v1.0.txt        | K-Public    | v1.0   | AI 공무원 · 민원 자동화           |
| SP-11_kstock_v1.0.txt         | K-Stock     | v1.0   | AI 자산관리 · 89개 자산군         |
| SP-12_kdemocracy_v1.0.txt     | K-Democracy | v1.0   | DAWN · AI 직접 민주주의           |
| SP-13_klogistics_v1.0.txt     | K-Logistics | v1.0   | 1~3차 산업 물류 통합              |
| SP-14_kinsurance_v1.0.txt     | K-Insurance | v1.0   | AI 보험 · 비용 1/1,000           |

---

## 폭포수 파이프라인 구조

```
사용자 입력
    │
    ▼
SP-00-ROUTER (1단계)
    │  서비스코드 + 신뢰도 반환
    ▼
전문 SP fetch (2단계)
GitHub Raw URL → SP-{번호}_{코드}_v{버전}.txt
    │
    ▼
전문 SP 기반 AI 응답 생성
    │
    ▼
PDV 기록 + OpenHash 앵커링
```

---

## 라우팅 코드표

| 코드 | 서비스      | 임계값 |
|------|-------------|--------|
| LAW  | K-Law       | 0.70   |
| EMG  | K-119       | 0.60   |
| POL  | K-Police    | 0.65   |
| HLT  | K-Health    | 0.70   |
| MKT  | K-Market    | 0.75   |
| TRF  | K-Traffic   | 0.75   |
| TAX  | K-Tax       | 0.75   |
| GDC  | GDC         | 0.75   |
| SCH  | K-School    | 0.70   |
| PUB  | K-Public    | 0.70   |
| STK  | K-Stock     | 0.75   |
| DEM  | K-Democracy | 0.70   |
| LOG  | K-Logistics | 0.70   |
| INS  | K-Insurance | 0.70   |
| ECO  | 일반 대화   | -      |

---

## 네이밍 컨벤션

```
SP-{번호(2자리)}-{역할}-v{메이저}.{마이너}.txt   ← 라우터
SP-{번호(2자리)}_{서비스코드}_v{메이저}.{마이너}.txt ← 전문 SP
```

---

## 기여 가이드

1. 새 서비스 추가 시 → SP-15_ 이후 번호 사용
2. 버전 업데이트 → 파일명 버전 변경 + SP-00-ROUTER 테이블 갱신
3. PR 제출 전 → [OFP 표준](../../ofp_standard.html) 준수 여부 확인
4. 테스트 → webapp.html 콘솔에서 라우팅 결과 확인

---

*AI City Inc. · 팀 주피터 · gopang.net · github.com/Openhash-Gopang*
*DAWN: Democracy is All We Need · MIT License*
