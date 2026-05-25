# Co-Create AI — Design System Reference (Full)

> **통합본 안내:** 이 파일은 랜딩 페이지와 앱 내부 화면을 모두 포함한 전체 디자인 시스템 레퍼런스입니다.
> - 랜딩 페이지 전용(마케팅/프로모션 영상) → `DESIGN_LANDING.md`
> - 앱 내부 화면 전용(데모/튜토리얼 영상) → `DESIGN_APP.md`

> **목적:** 이 문서는 AI 영상 생성 도구(Sora, Runway, Kling 등)가 Co-Create AI 플랫폼의 브랜드 정체성과 시각적 언어를 이해하고, 일관된 소개 영상을 제작할 수 있도록 작성된 디자인 시스템 레퍼런스입니다.

---

## 1. 색상 팔레트

### 1-A. Slate Neutrals (기반 색상)

배경, 텍스트, 보더에 사용되는 핵심 뉴트럴 팔레트입니다.

| 토큰 | Hex | 용도 |
|------|-----|------|
| `slate-950` | `#131C24` | 최고 진한 배경, 다크 사이드바 |
| `slate-900` | `#1E2A35` | 메인 텍스트, 다크 배경 |
| `slate-800` | `#2A3848` | 진한 배경 레이어 |
| `slate-700` | `#6b7280` | 보조 텍스트 |
| `slate-500` | `#62788A` | 중간 톤 텍스트 |
| `slate-300` | `#9BAAB7` | 플레이스홀더, 비활성 |
| `slate-200` | `#C5D0D9` | 보더, 구분선 |
| `slate-100` | `#E2E8ED` | 서브틀 보더 |
| `slate-50`  | `#F4F6F8` | 카드 배경 |
| `slate-25`  | `#FAFBFC` | 페이지 기본 배경 |

**시각적 인상:** 따뜻하지 않은 블루-그레이 계열의 차가운 뉴트럴. 차분하고 전문적인 느낌.

---

### 1-B. Emerald / Cyan (브랜드 주 색상 — Primary)

AI, 협업, 활성 상태를 나타내는 핵심 브랜드 컬러입니다.

| 토큰 | Hex | 용도 |
|------|-----|------|
| `emerald-700` | `#0e7490` | 호버 강조, 진한 상태 |
| `emerald-600` | `#0891b2` | CTA 버튼 호버 |
| `emerald-500` | `#06b6d4` | **메인 브랜드 컬러** — CTA, 활성 링크, 아이콘 |
| `emerald-400` | `#22d3ee` | 라이트 강조 |
| `emerald-200` | `#a5f3fc` | 보더 강조 |
| `emerald-50`  | `#ecfeff` | 배경 틴트, 뱃지 배경 |

**그라디언트 예시:**
```
linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)
radial-gradient(ellipse, rgba(6,182,212,0.15) 0%, transparent 70%)  /* 히어로 글로우 */
```

**포커스 링:** `box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.25)`

---

### 1-C. Coral (충돌·경고 색상 — Secondary)

갈등, 에러, 주의가 필요한 항목에 사용합니다.

| 토큰 | Hex | 용도 |
|------|-----|------|
| `coral-600` | `#C0423A` | 호버 |
| `coral-500` | `#D05045` | **메인 Coral** — 갈등 뱃지, 경고 |
| `coral-400` | `#DC6B62` | 미디엄 강조 |
| `coral-200` | `#F2B8B4` | 보더 |
| `coral-50`  | `#FDF4F3` | 배경 틴트 |

**pulse-ring 애니메이션 (충돌 표시):**
```
0% → box-shadow: 0 0 0 0 rgba(208,80,69,0.6)
70% → box-shadow: 0 0 0 8px rgba(208,80,69,0)
```

---

### 1-D. Amber (리드 유저·하이라이트 색상)

리드 유저 롤, 경고성 하이라이트, 앰버 마커에 사용합니다.

| 토큰 | Hex | 용도 |
|------|-----|------|
| `amber-500` | `#C88A1A` | **메인 Amber** — 리드 유저 아바타, 강조 |
| `amber-100` | `#FEF0CC` | 배경 틴트 |
| `amber-50`  | `#FFFBF0` | 연한 배경 |

---

### 1-E. 랜딩 페이지 전용 (다크 모드)

랜딩 페이지는 딥 다크 테마를 사용합니다.

| 용도 | Hex |
|------|-----|
| 메인 배경 | `#0a1628` |
| 보조 배경 | `#0f1e30` |
| 3차 배경 | `#14243a` |
| 사이드바 다크 | `#071220` |
| 텍스트 | `#f0f4f8` |
| 뮤트 텍스트 | `#7a9bb5` |

---

## 2. 타이포그래피

### 2-A. 폰트 패밀리

| 용도 | 폰트 | 소스 |
|------|------|------|
| **앱 메인** | `Inter` (Variable, 100–900wt) | `/fonts/InterVariable.ttf` |
| **랜딩 디스플레이** | `Fraunces` | Google Fonts — `wght@300;400` |
| **랜딩 바디** | `DM Sans` | Google Fonts — `wght@300;400;500` |
| **코드/모노** | `JetBrains Mono`, `Fira Code` | 시스템 폴백 |

**Fraunces 특성:** 세리프 디스플레이체, 이탤릭 사용 시 유기적이고 고급스러운 느낌. 랜딩 히어로와 대형 수치(stat numbers)에만 사용.

---

### 2-B. 폰트 크기 스케일

| 클래스 | 값 | 용도 |
|--------|----|------|
| `2xs`  | 10px | 초소형 레이블, 타임스탬프 |
| `xs`   | 11px | 서브레이블, 메타정보 |
| `sm`   | 13px | 보조 텍스트, 뱃지 |
| `base` | 14px | **기본 본문** |
| `md`   | 16px | 강조 본문 |
| `lg`   | 18px | 섹션 부제목 |
| `xl`   | 22px | 카드 제목 |
| `2xl`  | 28px | 페이지 제목 |
| `3xl`  | 34px | 대형 제목 |
| `4xl`  | 44px | 히어로 서브 |
| `5xl`  | 56px | 히어로 타이틀 |

**랜딩 히어로 타이틀:** `clamp(48px, 6.5vw, 82px)` — 반응형

---

### 2-C. 폰트 웨이트

| 용도 | Weight |
|------|--------|
| 네비게이션 활성 | 600 |
| 카드 제목 | 600 |
| 버튼 텍스트 | 500 |
| 본문 | 400 |
| 랜딩 디스플레이 (Fraunces) | 300 (Light) |
| 통계 수치 (stat-num) | 300 (Light Fraunces) |
| 레이블 Uppercase | 600 |

---

### 2-D. 자간 (Letter Spacing)

| 클래스 | 값 | 용도 |
|--------|----|------|
| `tight` | `-0.025em` | 대형 제목 |
| `snug`  | `-0.01em` | 브랜드명, 중간 제목 |
| `wide`  | `0.04em` | Uppercase 레이블 |
| `wider` | `0.08em` | 소형 메타 레이블 |
| `widest`| `0.15em` | 아주 작은 캡션 |

**앱 플랫폼 이름 스타일:**
```
fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', color: '#1E2A35'
```

**서브타이틀 (DECISION SPRINT PLATFORM):**
```
fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: rgba(30,42,53,0.45)
```

---

## 3. 레이아웃 원칙

### 3-A. 전체 구조

```
┌─────────────────────────────────────────────────┐
│  Header (fixed, 48px height)                    │
├────────────┬────────────────────────────────────┤
│ Sidebar    │  Main Content Area                 │
│ 64px (collapsed)                               │
│ 220px (expanded)  Cards / Workspace Canvas     │
│            │                                   │
│            │                                   │
└────────────┴────────────────────────────────────┘
```

- **페이지 배경:** `#FAFBFC` (slate-25)
- **사이드바 배경:** `#f5f6f8` (navy, 약간 다른 뉴트럴)
- **콘텐츠 패딩:** `24px` (일반) / `32px` (넓은 화면)

---

### 3-B. 사이드바

| 상태 | 너비 | 전환 |
|------|------|------|
| 접힘 (기본) | `64px` | hover로 자동 확장 |
| 펼침 | `220px` | `transition: width 300ms ease` |

- **구분선:** `border-right: 1px solid rgba(0,0,0,0.08)`
- **로고 영역:** 패딩 `14px 8px 12px`
- **네비 아이템 패딩:** 접힘 `6px 0` / 펼침 `6px 10px`
- **네비 아이템 간격:** `gap: 1px`
- **활성 배경:** `rgba(6,182,212,0.12)`
- **활성 텍스트:** `#06b6d4` (emerald-500)
- **전환:** `120ms` (배경/컬러), `300ms` (레이아웃)

**액티브 스프린트 박스:**
```
background: rgba(6,182,212,0.08)
border: 1px solid rgba(6,182,212,0.25)
border-radius: 4px
padding: 8px 10px
```

---

### 3-C. 카드 레이아웃

| 속성 | 값 |
|------|-----|
| 보더 | `1px solid #E2E8ED` (slate-100) |
| 배경 | `#FFFFFF` |
| 보더 라디우스 | `6px` (컴팩트) / `8px` (일반) / `12px` (랜딩 피처) / `16px` (랜딩 대형) |
| 그림자 | `0 1px 2px rgba(30,42,53,0.06)` (xs) |
| 패딩 | `14px 16px` (타일) / `30px` (피처 카드) |

**피처 카드 호버 효과:**
```
border-color: rgba(6,182,212,0.25)
transform: translateY(-5px)
transition: all 0.3s
+ top gradient line 나타남: linear-gradient(90deg, transparent, #06b6d4, transparent)
```

---

### 3-D. 간격 시스템

| 용도 | 값 |
|------|-----|
| 페이지 상단 패딩 | `24px` |
| 섹션 간격 | `32px` |
| 카드 그리드 gap | `12px–16px` |
| 인라인 요소 gap | `4px–8px` |
| 아이콘 + 텍스트 gap | `6px–8px` |

---

## 4. UI 컴포넌트 스타일

### 4-A. 버튼

#### Primary Button (CTA)
```
background: #06b6d4 (emerald-500)
color: #FFFFFF
padding: 14px 28px
border-radius: 10px
font-size: 15px, font-weight: 500
border: none
transition: all 0.2s

hover:
  background: #0891b2 (emerald-600)
  transform: translateY(-2px)
  box-shadow: 0 8px 24px rgba(6,182,212,0.3)
```

#### Ghost Button (보조)
```
background: transparent
color: 현재 텍스트 컬러
padding: 14px 28px
border-radius: 10px
border: 1px solid rgba(255,255,255,0.18) [다크] / rgba(15,23,42,0.18) [라이트]
font-size: 15px, font-weight: 400
transition: all 0.2s

hover:
  border-color: #06b6d4
  background: rgba(255,255,255,0.05) [다크] / rgba(15,23,42,0.06) [라이트]
```

#### Compact Button (앱 내부)
```
background: #06b6d4
color: #FFFFFF
padding: 6px 12px
border-radius: 4px–6px
font-size: 11px–13px, font-weight: 600
```

---

### 4-B. 카드 / 타일

#### KPI/통계 타일
```
background: #FFFFFF
border: 1px solid #E2E8ED
border-radius: 6px
padding: 14px 16px
box-shadow: 0 1px 2px rgba(30,42,53,0.06)

레이블: font-size:10px, font-weight:600, uppercase, letter-spacing:0.08em, color:#62788A
값: font-size:28px, font-weight:700, color:#1E2A35
서브: font-size:11px, color:#62788A
```

#### 피처 카드 (랜딩)
```
background: var(--bg2)
border: 1px solid var(--border)
border-radius: 16px
padding: 30px
transition: all 0.3s
```

---

### 4-C. 뱃지

#### 상태 뱃지 (앱)
```
font-size: 10px–11px
font-weight: 600
border-radius: 9999px (pill)
padding: 1px 5px–2px 6px

— Active (활성): background emerald-50, color emerald-500, border emerald-200
— Busy (바쁨): background amber-50, color amber-500, border amber-100
— Offline: background slate-50, color slate-400, border slate-100
— Conflict (갈등): background coral-500, color white
```

#### 랜딩 뱃지 (pill)
```
display: inline-flex; align-items: center; gap: 8px
padding: 6px 14px; border-radius: 999px
border: 1px solid rgba(6,182,212,0.35)
background: rgba(6,182,212,0.08)
font-size: 13px; color: #06b6d4 (emerald-500)
```

#### 숫자 뱃지 (네비)
```
background: #D05045 (coral-500)
color: #FFFFFF
border-radius: 9999px
font-size: 10px, font-weight: 600
padding: 1px 5px
```

---

### 4-D. 프로그레스 바

#### 기본 프로그레스
```
height: 3px–4px
background (트랙): rgba(0,0,0,0.08) / #E2E8ED
background (채움): #06b6d4 (emerald-500)
border-radius: 2px–9999px
```

#### 아바타 / 롤 색상
```
Engineer → #06b6d4 (emerald/cyan)
Designer → #6b7280 (slate-700 gray)
Lead User → #C88A1A (amber-500)
```

---

### 4-E. 아바타

```
width: 28px–32px; height: 28px–32px
border-radius: 4px (정사각형, 둥근 모서리)
background: 롤 색상 (Engineer=cyan, Designer=gray, Lead=amber)
color: #FFFFFF
font-size: 11px–12px; font-weight: 700
text: 이니셜 2자 (예: AK, LS, KJ)
```

---

### 4-F. 인풋 / 텍스트에어리어

```
border: 1px solid #C5D0D9 (slate-200)
border-radius: 6px
padding: 8px 10px
font-size: 13px–14px
background: #FFFFFF

focus:
  border-color: #06b6d4
  box-shadow: 0 0 0 3px rgba(6,182,212,0.25)
  outline: none
```

---

### 4-G. 워크스페이스 마커 (블루프린트 핀)

디자인 캔버스 위에 배치되는 위치 마커입니다.

```
width: 10px; height: 10px
border-radius: 50%
border: 2px solid #FFFFFF
box-shadow: 0 1px 4px rgba(0,0,0,0.25)

색상 유형:
  — Coral (#f87171 / #D05045): 갈등 마커
  — Emerald (#06b6d4): 엔지니어 마커
  — Amber (#fbbf24): 리드 유저 마커
```

---

## 5. 애니메이션 원칙

### 5-A. Easing 함수

| 용도 | Easing |
|------|--------|
| 대부분의 UI 전환 | `cubic-bezier(0.2, 0, 0, 1)` (빠른 시작, 부드럽게 감속) |
| 레이아웃/사이드바 | `ease` |
| 랜딩 리빌 | `ease` (700ms) |
| 버튼 호버 | `0.2s ease` |

---

### 5-B. 핵심 애니메이션

#### fade-in (등장)
```
from: opacity:0, transform: translateY(8px)
to:   opacity:1, transform: translateY(0)
duration: 0.3s
easing: cubic-bezier(0.2,0,0,1)
```

#### slide-in (옆에서 등장)
```
from: opacity:0, transform: translateX(16px)
to:   opacity:1, transform: translateX(0)
duration: 0.25s
easing: cubic-bezier(0.2,0,0,1)
```

#### pulse-ring (충돌 알림)
```
0%:  box-shadow 0 0 0 0 rgba(208,80,69,0.6) + 0 0 0 0 rgba(208,80,69,0.3)
70%: box-shadow 0 0 0 8px rgba(208,80,69,0) + 0 0 0 14px rgba(208,80,69,0)
duration: 2s, infinite
```

#### option-glow (AI 제안 강조)
```
0%,100%: box-shadow 0 0 0 2px rgba(6,182,212,0.4), 0 4px 16px rgba(6,182,212,0.12)
50%:     box-shadow 0 0 0 3px rgba(6,182,212,0.7), 0 6px 24px rgba(6,182,212,0.22)
duration: 2.5s, infinite
```

#### pulse-dot (상태 인디케이터)
```
0%,100%: opacity:1, scale(1)
50%:     opacity:0.7, scale(1.15)
duration: 2s, infinite
```

#### landing-fadeUp (랜딩 섹션 등장)
```
from: opacity:0, transform: translateY(24px)
to:   opacity:1, transform: translateY(0)
duration: 0.6s–0.9s (순차적 delay: 0.1s, 0.2s, 0.3s, 0.4s)
```

#### reveal (스크롤 트리거 등장)
```
초기: opacity:0, transform:translateY(32px)
visible 클래스 추가 시: opacity:1, transform:translateY(0)
transition: opacity 0.7s ease, transform 0.7s ease
IntersectionObserver threshold: 0.15
```

---

### 5-C. 호버 효과 요약

| 요소 | 효과 |
|------|------|
| Primary CTA 버튼 | `translateY(-2px)` + emerald glow shadow |
| 피처 카드 | `translateY(-5px)` + 상단 emerald 그라디언트 라인 |
| 네비 아이템 | 배경 `rgba(0,0,0,0.05)` |
| 링크 | 텍스트 컬러 뮤트 → 기본 |
| 사이드바 | 너비 64px → 220px (300ms) |

---

## 6. 브랜드 톤앤매너

### 6-A. 핵심 가치

| 키워드 | 설명 |
|--------|------|
| **Industry 5.0** | 인간과 AI의 공존 협업. 기계가 일방적으로 결정하지 않고, 인간의 가치 판단을 AI가 보조 |
| **Decision Clarity** | 갈등을 숨기지 않고 구조화. 불명확함을 제거하는 명료한 플랫폼 |
| **Collaborative** | 디자이너·엔지니어·사용자 등 다양한 역할이 하나의 스프린트 안에서 공존 |
| **Professional Modern** | 차갑지 않되, 무게감 있는 전문성. 스타트업 느낌보다는 엔터프라이즈 정밀함 |

---

### 6-B. 시각적 언어

- **배경:** 다크 네이비(`#0a1628`)에서 라이트 슬레이트(`#FAFBFC`)까지 — 선택 가능한 듀얼 모드
- **액센트:** Emerald/Cyan은 AI, 합의, 진행을 상징. 디지털 정보 흐름처럼 차갑고 정교함
- **충돌:** Coral은 갈등과 긴장을 표현. 위협적이지 않지만 명확하게 "해결이 필요함"을 알림
- **구도:** 좌측 정렬, 그리드 기반, 여백 충분히. 복잡한 정보를 깔끔하게 분리
- **텍스처:** `grid-bg` — 60×60px 격자 (emerald 4% 불투명도). 공학적이고 기술적인 분위기
- **글로우:** 히어로 섹션의 방사형 emerald glow — AI 에너지, 혁신의 원천

---

### 6-C. 영상 제작 시 분위기 키워드

```
조명:  차갑고 푸른 ambient light, 포인트 라이트는 cyan/teal
무드:  밤의 테크 오피스, 정밀한 작업, 조용한 집중
모션:  빠른 출발 → 부드러운 감속 (easeOut 계열)
속도:  성급하지 않음. 정보가 차례로 등장하며 쌓이는 느낌
색온도: 쿨 화이트~블루, 따뜻한 amber 포인트 (리드 유저 강조 시)
공간감: 충분한 여백, 미니멀하지만 정보 밀도 높음
```

---

## 7. 주요 화면 구성

### 7-A. 랜딩 페이지

**구조 (위→아래):**
```
[Fixed Navbar 64px]
  로고 | Features / How it works / Results 링크 | [Log in] [Get started]

[Hero Section — 100vh]
  hero-glow (cyan 방사형 배경빛)
  grid-bg (격자 텍스처)
  [badge: "AI-powered design collaboration" ← pulse dot]
  h1 (Fraunces Light): "Where design teams reach consensus faster"
       ↑ 이탤릭 'consensus' 는 Emerald 컬러
  p: 부제 설명 (DM Sans, 18px, 뮤트)
  [Start for free →] [See how it works] 버튼
  [App Mockup Preview — 브라우저 창 형태]

[Stats Row — 4열]
  3× faster decisions | 91% consensus rate | 50% fewer revisions | ∞ AI sprints

[How It Works — 3열 그리드]
  01. Set your North Star → 02. Sprint through conflicts → 03. Reach consensus

[Features — 3×2 카드 그리드]
  Decision Sprints | AI Analysis | Value Conflict Matrix
  Real-time Collaboration | Design Upload & Markers | North Star Alignment

[Final CTA Section]
  "Ready to end decision gridlock?" + [Start free today] [Log in]

[Footer]
  로고 + copyright | Privacy / Terms / Contact 링크
```

**앱 목업 (브라우저 창 안에 표시되는 미니 UI):**
- 상단 맥OS 스타일 dot (빨강/노랑/초록) + URL 바
- 좌측: 스프린트 타임라인 dots + 디자인 캔버스 (마커 3개: coral, emerald, amber) + 팀 채팅
- 우측: AI Analysis 버튼 + KPI 타일들 (Active conflict, Positions, Alternative proposal)

---

### 7-B. 대시보드 / Hub 화면

**구조:**
```
[사이드바 — 좌측]
  로고 + 플랫폼명 "Co-Create AI" / "DECISION SPRINT PLATFORM"
  [Active Sprint 박스: emerald 틴트, 프로그레스 바 67%]
  네비: Hub / Sprints(1) / Conflicts(3) / Timeline / Stakeholders / Reports
  ─────── 구분선 ───────
  Settings / Help
  [유저 아바타 (롤 컬러) + 이름 + 롤]

[메인 컨텐츠]
  [KPI 타일 4개: 활성 스프린트 수, 해결된 갈등, 컨센서스 비율, 다음 마감]
  [최근 활동 목록]
  [진행 중인 스프린트 카드들]
```

---

### 7-C. 워크스페이스 (Sprint 화면)

**구조:**
```
[헤더 — 상단]
  프로젝트명 + 스프린트 번호 | 언어 선택 | 개요 버튼

[메인 3열 레이아웃]
┌──────────────┬──────────────────────────┬──────────────┐
│ 좌측 패널    │   디자인 캔버스           │  우측 패널   │
│              │   (점선 emerald 테두리)   │              │
│ 스프린트     │   마커 오버레이 (coral,   │ AI Analysis  │
│ 타임라인     │   emerald, amber 핀)      │ 버튼         │
│              │                          │              │
│ 팀 챗        │   줌 컨트롤              │ 갈등 정보    │
│ 버블들       │                          │ 카드들       │
│              │                          │              │
│              │                          │ 투표 상태    │
└──────────────┴──────────────────────────┴──────────────┘
```

**디자인 캔버스:**
```
배경: rgba(6,182,212,0.06)
보더: 1px dashed rgba(6,182,212,0.35)
border-radius: 8px
줌: 0.2x–5x 지원
```

**AI Analysis 버튼:**
```
width: 100%
padding: 6px
background: emerald-500
color: white
font-size: 8px–11px (미니 버전) / 13px (풀 버전)
font-weight: 600
border-radius: 6px
텍스트: "Request AI Analysis"
```

**투표 카드:**
- option-glow 애니메이션 적용 (AI 추천 옵션에)
- 투표 현황: 동그라미 채움 비율로 표시

---

### 7-D. 스테이크홀더 페이지

```
[통계 타일 행: 총 멤버, 활성, Avg Weight, 전문 분야]
[스테이크홀더 카드 그리드]
  각 카드:
  — 아바타 원 (롤 accent 컬러)
  — 이름 + 롤 + 상태 뱃지 (active/busy/offline/pending)
  — 의사결정 가중치 프로그레스 바
  — 전문 분야 pills (아이콘 + 텍스트)
```

---

## 8. 로고 사용 가이드

### 8-A. 로고 파일

| 파일 | 경로 | 용도 |
|------|------|------|
| `logo-v2.png` | `/public/assets/logo-v2.png` | 사이드바, 기본 앱 로고 (30×30px) |
| `logo-transparent.png` | `/public/assets/logo-transparent.png` | 투명 배경 필요 시 |
| `logo3.png` | `/public/assets/logo3.png` | 대체 버전 |

### 8-B. 텍스트 로고 (코드 기반)

랜딩 페이지에서 사용되는 텍스트 기반 로고:
```
[C]  Co-Create AI
     DECISION SPRINT PLATFORM

[C] 박스:
  width/height: 34px (네비) / 28px (푸터)
  border-radius: 8px (네비) / 7px (푸터)
  background: #06b6d4 (emerald-500)
  color: #FFFFFF
  font-weight: 700
  font-size: 14px (네비) / 12px (푸터)
  font-family: DM Sans
```

### 8-C. 사이드바 로고 규칙

```
이미지: logo-v2.png, 30×30px, flex-shrink:0
텍스트 (확장 시에만 표시):
  상단: "Co-Create AI" — 13px, 700wt, #1E2A35, letter-spacing:-0.01em
  하단: 플랫폼 부제 — 9px, 500wt, uppercase, letter-spacing:0.06em, 45% 불투명 #1E2A35
```

### 8-D. 로고 사용 원칙

- 로고와 텍스트 사이 최소 `gap: 8–10px`
- 다크 배경에는 흰색 텍스트, 라이트 배경에는 `#1E2A35`
- 로고 단독 사용 시 emerald-500 배경 박스 안에 표시
- 로고 아이콘 최소 크기: `24px`

---

## 9. 영상 제작 참고 — 시퀀스 제안

AI 영상 생성 도구를 위한 씬별 시각적 가이드:

### Scene 1: 오프닝 (0–3초)
- **배경:** `#0a1628` 딥 다크 네이비
- **효과:** 중앙에서 emerald radial glow 천천히 확장
- **텍스트:** "Co-Create AI" — Fraunces Light, 흰색, 서서히 fade-in
- **분위기:** 우주에서 한 점의 빛이 퍼져나오는 느낌

### Scene 2: 문제 제기 (3–8초)
- **화면:** 디자이너와 엔지니어 아바타 (cyan vs gray) — 의견 충돌 표현
- **효과:** Coral pulse-ring 애니메이션, 충돌 뱃지 `3`
- **색상:** Coral `#D05045` 강조

### Scene 3: 플랫폼 등장 (8–15초)
- **화면:** 앱 UI가 좌에서 우로 slide-in
- **효과:** 워크스페이스 캔버스 위 마커들이 순서대로 생겨남
- **색상:** Emerald glow로 전환

### Scene 4: AI 분석 (15–22초)
- **화면:** "Request AI Analysis" 버튼 클릭 → option-glow 애니메이션
- **효과:** 그래프, 수치 fade-in (0.1s 간격 stagger)
- **색상:** Emerald `#06b6d4` 주조

### Scene 5: 합의 (22–28초)
- **화면:** 투표 완료, 프로그레스 바가 100%로 채워짐
- **효과:** 상승하는 fade-up 애니메이션들
- **수치:** `91% consensus`, `3× faster`

### Scene 6: 클로징 (28–30초)
- **화면:** 로고 + "Co-Create AI" 텍스트 중앙 배치
- **효과:** 배경 grid-bg 격자 서서히 등장
- **CTA:** "Start for free" (emerald-500 배경)

---

## 부록: 그림자 시스템

| 클래스 | 값 | 용도 |
|--------|----|------|
| `shadow-xs` | `0 1px 2px 0 rgba(30,42,53,0.06)` | 카드 기본 |
| `shadow-sm` | `0 1px 3px 0 rgba(30,42,53,0.10), 0 1px 2px -1px rgba(30,42,53,0.08)` | 버튼, 인풋 |
| `shadow-md` | `0 4px 8px -2px rgba(30,42,53,0.10), 0 2px 4px -2px rgba(30,42,53,0.08)` | 드롭다운 |
| `shadow-lg` | `0 12px 24px -4px rgba(30,42,53,0.12), 0 4px 8px -4px rgba(30,42,53,0.08)` | 모달 |
| `shadow-xl` | `0 24px 48px -8px rgba(30,42,53,0.16)` | 랜딩 목업 |
| `shadow-focus` | `0 0 0 3px rgba(6,182,212,0.25)` | 포커스 링 |

---

## 부록: 보더 라디우스 시스템

| 클래스 | 값 |
|--------|----|
| `rounded-xs` | 2px |
| `rounded-sm` | 4px |
| `rounded-md` | 6px |
| `rounded-lg` | 8px |
| `rounded-xl` | 12px |
| `rounded-full` | 9999px (pill/뱃지) |

---

*최종 업데이트: 2026-05-12 | Co-Create AI Design System v1.0*
