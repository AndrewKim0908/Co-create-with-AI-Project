# Co-Create AI — App Design Guide

> **목적:** 제품 데모·튜토리얼 영상 제작용 디자인 가이드.
> 앱 내부 화면(대시보드, 워크스페이스, 스테이크홀더 등)의 시각적 언어를 다룬다.
> 랜딩 페이지는 `DESIGN_LANDING.md` 참조. 통합본은 `DESIGN_FULL.md` 참조.

---

## 1. 색상 팔레트

### 1-A. 앱 배경 (라이트 모드 기반)

앱은 라이트 모드를 기본으로 한다. 흰색에 가까운 쿨 뉴트럴 팔레트.

| 용도 | Hex | 설명 |
|------|-----|------|
| 페이지 배경 | `#FAFBFC` | 사이트 기반 배경 (slate-25) |
| 사이드바 배경 | `#f5f6f8` | 약간 다른 뉴트럴 (navy) |
| 카드/흰 배경 | `#FFFFFF` | 타일, 모달 내부 |
| 서브틀 배경 | `#F4F6F8` | 두 번째 레이어 (slate-50) |
| 뮤트 배경 | `#E2E8ED` | 구분 영역 (slate-100) |
| 다크 배경 | `#1E2A35` | 역방향 배경 (slate-900) |
| 최다크 배경 | `#131C24` | 가장 진한 배경 (slate-950) |

---

### 1-B. Slate Neutrals (전체)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `slate-950` | `#131C24` | 최고 진한 배경 |
| `slate-900` | `#1E2A35` | **메인 텍스트 (fg1)** |
| `slate-800` | `#2A3848` | 진한 배경 레이어 |
| `slate-700` | `#6b7280` | **보조 텍스트 (fg2)** |
| `slate-500` | `#62788A` | **중간 텍스트 (fg3)** |
| `slate-400` | `#7A8E9E` | 보조 정보 |
| `slate-300` | `#9BAAB7` | **연한 텍스트 (fg4)**, 플레이스홀더 |
| `slate-200` | `#C5D0D9` | **기본 보더 (border)** |
| `slate-100` | `#E2E8ED` | **서브틀 보더 (borderSubtle)** |
| `slate-50`  | `#F4F6F8` | 서브틀 배경 |
| `slate-25`  | `#FAFBFC` | 페이지 기본 배경 |

---

### 1-C. Emerald / Cyan (Primary — AI·활성·합의)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `emerald-700` | `#0e7490` | 강한 호버 |
| `emerald-600` | `#0891b2` | CTA 호버 |
| `emerald-500` | `#06b6d4` | **메인 브랜드** — CTA, 활성 네비, 프로그레스 바, 마커 |
| `emerald-400` | `#22d3ee` | 밝은 강조 |
| `emerald-200` | `#a5f3fc` | 보더 강조 |
| `emerald-100` | `#cffafe` | 밝은 배경 |
| `emerald-50`  | `#ecfeff` | 연한 배경 틴트 |

**포커스 링:** `box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.25)`

---

### 1-D. Coral (갈등·경고·에러)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `coral-600` | `#C0423A` | 호버 |
| `coral-500` | `#D05045` | **메인 Coral** — 충돌 뱃지, 경고, 마커 핀 |
| `coral-400` | `#DC6B62` | 미디엄 강조 |
| `coral-200` | `#F2B8B4` | 보더 |
| `coral-100` | `#FAE0DD` | 연한 보더 |
| `coral-50`  | `#FDF4F3` | 배경 틴트 |

**pulse-ring (충돌 알림):**
```css
0%:  box-shadow 0 0 0 0 rgba(208,80,69,0.6), 0 0 0 0 rgba(208,80,69,0.3)
70%: box-shadow 0 0 0 8px rgba(208,80,69,0), 0 0 0 14px rgba(208,80,69,0)
```

---

### 1-E. Amber (리드 유저·강조)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `amber-500` | `#C88A1A` | **메인 Amber** — 리드 유저 아바타, 앰버 마커 |
| `amber-100` | `#FEF0CC` | 배경 틴트 |
| `amber-50`  | `#FFFBF0` | 연한 배경 |

---

### 1-F. 롤(Role) 색상 매핑

| 역할 | 색상 | Hex |
|------|------|-----|
| Hardware Engineer | Emerald/Cyan | `#06b6d4` |
| Product Designer | Gray | `#6b7280` |
| Lead User | Amber | `#C88A1A` |

---

## 2. 타이포그래피

### 2-A. 폰트 패밀리

| 용도 | 폰트 | 소스 |
|------|------|------|
| **앱 전체** | `Inter` (Variable, 100–900wt) | `/fonts/InterVariable.ttf` |
| **코드/모노** | `JetBrains Mono`, `Fira Code` | 시스템 폴백 |

**CSS:**
```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/InterVariable.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

---

### 2-B. 폰트 크기 스케일

| 클래스 | 값 | 용도 |
|--------|----|------|
| `2xs`  | 10px | 레이블 Uppercase, 타임스탬프, 캡션 |
| `xs`   | 11px | 서브레이블, 메타정보, 아바타 이니셜 |
| `sm`   | 13px | 보조 텍스트, 사이드바 아이템, 뱃지 |
| `base` | 14px | **기본 본문**, 채팅 메시지 |
| `md`   | 16px | 강조 본문 |
| `lg`   | 18px | 섹션 부제목 |
| `xl`   | 22px | 카드 제목 |
| `2xl`  | 28px | **KPI 수치** |
| `3xl`  | 34px | 페이지 제목 |
| `4xl`  | 44px | 대형 제목 |
| `5xl`  | 56px | 히어로급 제목 |

---

### 2-C. 앱 내 실제 사용 패턴

| 요소 | fontSize | fontWeight | color |
|------|----------|------------|-------|
| 레이블 Uppercase | 10px | 600 | `#62788A` (fg3) |
| KPI 수치 | 28px | 700 | `#1E2A35` (fg1) |
| KPI 서브 | 11px | 400 | `#62788A` (fg3) |
| 카드 제목 (사이드바 플랫폼명) | 13px | 700 | `#1E2A35` |
| 사이드바 서브제목 | 9px | 500 | `rgba(30,42,53,0.45)` |
| 네비 아이템 (활성) | 12px | 600 | `#06b6d4` |
| 네비 아이템 (비활성) | 12px | 500 | `rgba(30,42,53,0.55)` |
| 채팅 발신자명 | 10px | 600 | `#62788A` |
| 뱃지 숫자 | 10px | 600 | `#FFFFFF` |
| 아바타 이니셜 | 11px | 700 | `#FFFFFF` |
| 인풋 | 13–14px | 400 | `#1E2A35` |

---

### 2-D. 자간 (Letter Spacing)

| 용도 | 값 |
|------|-----|
| 플랫폼명 | `-0.01em` |
| 대형 제목 | `-0.025em` |
| Uppercase 레이블 | `0.04em` (wide) 또는 `0.08em` (wider) |
| 소형 캡션 | `0.06em–0.15em` |

---

## 3. 앱 레이아웃

### 3-A. 전체 구조

```
┌────────────────────────────────────────────────────────┐
│  Header (fixed, 48px)                                  │
│  [← Back] [프로젝트명 — Sprint #N] [Overview] [🌐]    │
├────────────┬───────────────────────────────────────────┤
│            │                                           │
│  Sidebar   │  Main Content Area                        │
│  64px ←→  │                                           │
│  220px     │  KPI 타일 / 카드 그리드                   │
│  (hover)   │  또는 워크스페이스 캔버스                  │
│            │                                           │
│            │                                           │
└────────────┴───────────────────────────────────────────┘
```

- **페이지 배경:** `#FAFBFC`
- **사이드바 배경:** `#f5f6f8`
- **헤더:** 흰색 + 하단 보더 `rgba(0,0,0,0.08)`

---

### 3-B. 사이드바 상세

| 속성 | 값 |
|------|-----|
| 접힌 너비 | `64px` |
| 펼쳐진 너비 | `220px` |
| 전환 | `width 300ms ease` |
| 트리거 | `onMouseEnter / onMouseLeave` |
| 우측 보더 | `1px solid rgba(0,0,0,0.08)` |

**영역 구성 (위→아래):**
```
[로고 영역] padding: 14px 8px 12px
  - 로고 이미지 30×30px
  - 플랫폼명 "Co-Create AI" (13px, 700wt, -0.01em)
  - 서브타이틀 (9px, uppercase, 0.06em)

[액티브 스프린트 박스] margin: 10px 10px 4px
  - background: rgba(6,182,212,0.08)
  - border: 1px solid rgba(6,182,212,0.25)
  - border-radius: 4px; padding: 8px 10px
  - 레이블: 9px uppercase 0.08em
  - 스프린트명: 11px 600wt
  - 메타: 10px, 50% 불투명
  - 프로그레스 바: 3px, emerald-500, 67% 채움

[메인 네비] padding: 6px 8px, gap: 1px
  Hub / Sprints(1) / Conflicts(3) / Timeline / Stakeholders / Reports

[구분선] height:1px, rgba(0,0,0,0.08), margin: 4px 12px

[하단 네비] padding: 4px 8px, gap: 1px
  Settings / Help

[유저 섹션] padding: 10px 8px, marginTop: auto
  border-top: 1px solid rgba(0,0,0,0.08)
  [아바타 28px] [이름 12px/600wt] [롤 10px]
```

**네비 아이템 상태:**
```
기본:  background:transparent, color:rgba(30,42,53,0.55), 500wt
hover: background:rgba(0,0,0,0.05), color:#1E2A35
활성:  background:rgba(6,182,212,0.12), color:#06b6d4, 600wt
transition: background 120ms, color 120ms, gap 300ms, padding 300ms
```

---

### 3-C. 카드 레이아웃

| 속성 | 값 |
|------|-----|
| 배경 | `#FFFFFF` |
| 보더 | `1px solid #E2E8ED` |
| radius (컴팩트) | `6px` |
| radius (일반) | `8px` |
| radius (큰 카드) | `12px` |
| 기본 그림자 | `0 1px 2px rgba(30,42,53,0.06)` |
| 패딩 (KPI 타일) | `14px 16px` |
| 패딩 (일반 카드) | `16px 20px` |

---

### 3-D. 간격 시스템

| 용도 | 값 |
|------|-----|
| 페이지 패딩 | `24px` |
| 섹션 간격 | `32px` |
| 카드 그리드 gap | `12px–16px` |
| 아이콘 + 텍스트 gap | `6px–8px` |
| 인라인 요소 gap | `4px–8px` |

---

## 4. 앱 전용 컴포넌트

### 4-A. 버튼

#### Compact Button (앱 내부 기본)
```
background: #06b6d4 (emerald-500)
color: #FFFFFF
padding: 6px 12px
border-radius: 4px–6px
font-size: 11px–13px; font-weight: 600; font-family: Inter
border: none

hover: background #0891b2 (emerald-600)
```

#### AI Analysis 버튼 (워크스페이스)
```
width: 100%; padding: 6px
background: #06b6d4
color: #fff; font-size: 11px; font-weight: 600
border-radius: 6px; border: none
텍스트: "Request AI Analysis"

활성화 시: option-glow 애니메이션 적용
```

---

### 4-B. KPI / 통계 타일

```
background: #FFFFFF
border: 1px solid #E2E8ED (borderSubtle)
border-radius: 6px; padding: 14px 16px
box-shadow: 0 1px 2px rgba(30,42,53,0.06)

레이블:
  font-size: 10px; font-weight: 600
  text-transform: uppercase; letter-spacing: 0.08em
  color: #62788A (fg3); margin-bottom: 4px

값:
  font-size: 28px; font-weight: 700
  color: #1E2A35 (fg1); line-height: 1

서브:
  font-size: 11px; color: #62788A (fg3); margin-top: 4px
```

---

### 4-C. 상태 뱃지 (Badge)

| 상태 | 배경 | 텍스트 | 보더 |
|------|------|--------|------|
| Active (활성) | `#ecfeff` (emerald-50) | `#06b6d4` (emerald-500) | `#a5f3fc` (emerald-200) |
| Busy (바쁨) | `#FFFBF0` (amber-50) | `#C88A1A` (amber-500) | `#FEF0CC` (amber-100) |
| Offline | `#F4F6F8` (slate-50) | `#9BAAB7` (slate-300) | `#E2E8ED` (slate-100) |
| Pending | `#F4F6F8` (slate-50) | `#62788A` (slate-500) | `#E2E8ED` (slate-100) |

```
공통 스타일:
  font-size: 10px–11px; font-weight: 600
  border-radius: 9999px (pill)
  padding: 2px 6px–2px 8px
  border: 1px solid
```

#### 숫자 뱃지 (네비 알림)
```
background: #D05045 (coral-500)
color: #FFFFFF; border-radius: 9999px
font-size: 10px; font-weight: 600
padding: 1px 5px
```

---

### 4-D. 프로그레스 바

```
height: 3px–4px
border-radius: 2px–9999px

트랙 (배경):
  rgba(0,0,0,0.08) 또는 #E2E8ED (slate-100)

채움:
  background: #06b6d4 (emerald-500)
  border-radius: 동일
```

**사용 예:**
- 사이드바 액티브 스프린트: `height:3px, 67% 채움`
- 스테이크홀더 가중치 바: `height:4px`

---

### 4-E. 아바타

```
width: 28px–32px; height: 28px–32px
border-radius: 4px (정사각형, 둥근 모서리)

배경: 역할 색상
  Engineer → #06b6d4 (cyan)
  Designer → #6b7280 (gray)
  Lead     → #C88A1A (amber)

color: #FFFFFF
font-size: 11px–12px; font-weight: 700
content: 이니셜 2자 (예: LS, AK, KJ)
```

---

### 4-F. 인풋 / 텍스트에어리어

```
border: 1px solid #C5D0D9 (slate-200)
border-radius: 6px; padding: 8px 10px
font-size: 13px–14px; font-family: Inter
background: #FFFFFF; color: #1E2A35

focus:
  border-color: #06b6d4 (emerald-500)
  box-shadow: 0 0 0 3px rgba(6,182,212,0.25)
  outline: none

placeholder: color #9BAAB7 (slate-300)
```

---

### 4-G. 디자인 마커 핀 (워크스페이스)

블루프린트 캔버스 위 배치되는 위치 핀.

```
width: 10px; height: 10px; border-radius: 50%
border: 2px solid #FFFFFF
box-shadow: 0 1px 4px rgba(0,0,0,0.25)
position: absolute

색상 유형:
  Coral (#D05045 / #f87171) → 갈등·충돌 마커
  Emerald (#06b6d4)         → 엔지니어 마커
  Amber (#fbbf24)           → 리드 유저 마커
```

---

### 4-H. 워크스페이스 캔버스

```
flex: 1; border-radius: 8px
border: 1px dashed rgba(6,182,212,0.35)
background: rgba(6,182,212,0.06)
position: relative; min-height: 120px
display: flex; align-items: center; justify-content: center

줌 범위: 0.2x ~ 5x
줌 컨트롤: +/- 버튼, 리셋 버튼
```

---

### 4-I. 채팅 버블

```
max-width: 72%; padding: 5px 8px
border-radius: 8px 8px 8px 2px (왼쪽 하단 뾰족)
font-size: 9px–14px; line-height: 1.35–1.4
background: rgba(255,255,255,0.08) [다크] / #FFFFFF [라이트]
border: 1px solid rgba(255,255,255,0.06) [다크] / #E2E8ED [라이트]
```

---

### 4-J. 전문 분야 Pill (스테이크홀더)

```
display: inline-flex; align-items: center; gap: 4px
padding: 3px 8px; border-radius: 999px
background: #F4F6F8; border: 1px solid #E2E8ED
font-size: 11px; color: #62788A (fg3)
아이콘: 12px, role accent 컬러
```

---

## 5. 앱 전용 애니메이션

### 5-A. Easing 함수

| 용도 | Easing |
|------|--------|
| 컴포넌트 진입 | `cubic-bezier(0.2, 0, 0, 1)` |
| 사이드바 전환 | `ease` (300ms) |
| 배경/컬러 전환 | `120ms linear` |

---

### 5-B. fade-in (컴포넌트 등장)

```
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: fadeIn 0.3s cubic-bezier(0.2,0,0,1) both
```

---

### 5-C. slide-in (옆에서 진입)

```
@keyframes slideIn {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
animation: slideIn 0.25s cubic-bezier(0.2,0,0,1) both
```

---

### 5-D. pulse-ring (충돌 알림 강조)

```
@keyframes pulse-ring {
  0%:  box-shadow 0 0 0 0 rgba(208,80,69,0.6), 0 0 0 0 rgba(208,80,69,0.3)
  70%: box-shadow 0 0 0 8px rgba(208,80,69,0), 0 0 0 14px rgba(208,80,69,0)
  100%: 0으로 리셋
}
animation: pulse-ring 2s ease-out infinite
```
**적용:** 사이드바 Conflicts 뱃지(3), 충돌 마커 핀

---

### 5-E. option-glow (AI 제안 강조)

```
@keyframes option-glow {
  0%,100%: box-shadow 0 0 0 2px rgba(6,182,212,0.4), 0 4px 16px rgba(6,182,212,0.12)
  50%:     box-shadow 0 0 0 3px rgba(6,182,212,0.7), 0 6px 24px rgba(6,182,212,0.22)
}
animation: option-glow 2.5s ease-in-out infinite
```
**적용:** AI 추천 투표 옵션 카드, AI Analysis 버튼 활성 상태

---

### 5-F. pulse-dot (상태 인디케이터)

```
@keyframes pulse-dot {
  0%,100%: opacity:1, scale(1)
  50%:     opacity:0.7, scale(1.15)
}
animation: pulse-dot 2s infinite
```
**적용:** 활성 스프린트 상태 점, 연결 상태 인디케이터

---

### 5-G. 사이드바 전환

```
width: 64px → 220px (300ms ease)

텍스트/아이콘 opacity:
  접힘 시: opacity 100ms ease
  펼침 시: opacity 200ms ease 150ms (delay로 레이아웃 안정 후 등장)
```

---

### 5-H. 호버 효과 요약

| 요소 | 효과 |
|------|------|
| 네비 아이템 | `background rgba(0,0,0,0.05)` (120ms) |
| 사이드바 | 너비 64→220px (300ms) |
| Compact 버튼 | `background #0891b2` |
| 투표 카드 | `border-color rgba(6,182,212,0.4)` |
| 스크롤바 thumb | `background #C5D0D9` |

---

## 6. 브랜드 톤앤매너

### 6-A. 핵심 가치

| 키워드 | 설명 |
|--------|------|
| **Industry 5.0** | 인간과 AI의 공존 협업. 기계가 일방적으로 결정하지 않고 인간의 가치 판단을 AI가 보조 |
| **Decision Clarity** | 갈등을 구조화해 제거. 불명확함을 없애는 명료한 워크플로우 |
| **Collaborative** | 디자이너·엔지니어·사용자 등 다양한 역할이 하나의 스프린트 안에서 공존 |
| **Professional Modern** | 스타트업 느낌보다 엔터프라이즈 정밀함. 차갑지 않되 무게감 있는 전문성 |

---

### 6-B. 앱 시각적 언어

- **배경:** 화이트-뉴트럴 라이트 모드 — 작업에 집중하는 밝고 깨끗한 공간
- **액센트:** Emerald(AI·합의) vs Coral(갈등·긴장) — 상태를 직관적으로 표현
- **그리드:** 정보의 계층이 명확. 카드, 타일, 목록이 격자를 따라 정렬
- **타이포:** Inter의 정밀하고 중립적인 형태 — 정보 전달에 집중
- **여백:** 충분한 패딩으로 정보가 숨쉬도록. 밀도 높아도 답답하지 않음

---

### 6-C. 데모 영상 분위기

```
조명:    자연광 또는 밝은 오피스 조명, 악센트는 cyan
무드:    집중된 작업 환경, 전문적, 협업 중
모션:    빠른 시작 → 부드러운 감속, 스태거 등장
속도:    정보가 레이어별로 순서대로 나타남. 서두르지 않음
색조:    화이트 + 슬레이트 + emerald 포인트
텍스처:  플랫, 그림자 미니멀, 보더 중심의 구분
```

---

## 7. 앱 주요 화면 구성

### 7-A. 대시보드 / Hub

```
[헤더 — 48px]
  프로젝트 선택 드롭다운 | [언어 선택] | [유저 메뉴]

[메인 컨텐츠] padding: 24px
  [KPI 타일 행 — 4열 grid, gap:12px]
    ┌──────────┬──────────┬──────────┬──────────┐
    │ Active   │ Resolved │ Consensus│ Next     │
    │ Sprints  │ Conflicts│ Rate     │ Deadline │
    │ 3        │ 12       │ 91%      │ 2d       │
    └──────────┴──────────┴──────────┴──────────┘
    각 타일: 28px 수치, 10px uppercase 레이블

  [최근 활동 섹션]
    아이콘 + 텍스트 + 타임스탬프 목록

  [진행 중인 스프린트 카드들]
    스프린트명 | 참여자 아바타 행 | 상태 뱃지 | 프로그레스 바
```

---

### 7-B. 워크스페이스 (Sprint 화면)

```
[헤더]
  ← Back | "프로젝트명 — Sprint #N" (중앙) | Overview 🌐

[메인 3열 레이아웃]
┌──────────────┬──────────────────────────┬──────────────┐
│ 좌측 패널    │   디자인 캔버스           │  우측 패널   │
│              │   (점선 emerald 보더)     │  124px 고정  │
│ 스프린트     │   background:            │              │
│ 타임라인     │   rgba(6,182,212,0.06)   │ [AI Analysis]│
│ (dots)       │                          │ [emerald btn]│
│              │   마커 오버레이:          │              │
│ 디자인 캔버스│   ● coral (갈등)          │ [갈등 정보]  │
│ (이미지 업로드│  ● emerald (엔지니어)    │ KPI 타일     │
│ 가능)        │   ● amber (리드)          │              │
│              │                          │ [포지션]     │
│ [팀 채팅]    │   [줌 컨트롤 +/-]        │ KPI 타일     │
│ 버블 형태    │                          │              │
│              │                          │ [대안 제안]  │
│              │                          │ KPI 타일     │
│              │                          │              │
│              │                          │ [투표 상태]  │
└──────────────┴──────────────────────────┴──────────────┘

타임라인 dots:
  비활성: rgba(255,255,255,0.15) / #C5D0D9
  활성: #06b6d4 + box-shadow 0 0 0 2px rgba(6,182,212,0.35)
```

---

### 7-C. AI 투표 화면

```
[투표 옵션 카드 A]
  border-radius: 8px; padding: 16px
  border: 2px solid rgba(6,182,212,0.3)
  animation: option-glow (AI 추천 시)

  제목: 16px, 600wt, fg1
  설명: 14px, fg2, line-height: 1.6

  투표 현황:
    참여자 아바타 행 (동그라미 채움=찬성, 비채움=반대)

[투표 옵션 카드 B]
  동일 스타일, glow 없음

[컨센서스 도달 시]
  프로그레스 바 100% 채움 (emerald)
  "All approved" 상태 뱃지 (emerald)
```

---

### 7-D. 스테이크홀더 페이지

```
[통계 타일 행 — 4열]
  총 멤버 수 | 활성 | Avg Weight | 전문 분야 수

[스테이크홀더 카드 그리드]
  각 카드 (border-radius:8px, padding:16px, shadow-sm):

  ┌────────────────────────────────────────┐
  │ [아바타 원 40px]  이름 (16px, 700wt)   │
  │                   역할 (13px, fg3)     │
  │                   [상태 뱃지]          │
  │ ──────────────────────────────────────│
  │ Decision Weight                        │
  │ [━━━━━━━━░░░░] 1.2×                  │
  │                                        │
  │ Expertise                              │
  │ [🌡 Thermal] [📊 Analysis]            │
  └────────────────────────────────────────┘

아바타 원: 40px, border-radius:50%, 역할 accent 컬러
```

---

### 7-E. 프로젝트 카드 (선택 화면)

```
배경: #FFFFFF; border: 1px solid #E2E8ED
border-radius: 8px; padding: 20px
transition: box-shadow 0.15s, border-color 0.15s

hover:
  border-color: rgba(6,182,212,0.3)
  box-shadow: 0 4px 12px rgba(6,182,212,0.08)

상단: 프로젝트 아이콘 (44px, emerald 틴트 배경)
제목: 16px, 700wt, fg1
설명: 13px, fg3, line-height:1.5
하단: 참여자 아바타 스택 + 상태 뱃지
```

---

## 8. 로고 사용 가이드

### 8-A. 로고 파일

| 파일 | 경로 | 용도 |
|------|------|------|
| `logo-v2.png` | `/public/assets/logo-v2.png` | **앱 사이드바 기본 로고** (30×30px) |
| `logo-transparent.png` | `/public/assets/logo-transparent.png` | 투명 배경 필요 시 |
| `logo3.png` | `/public/assets/logo3.png` | 대체 버전 |

### 8-B. 사이드바 로고 스펙

```
이미지: logo-v2.png
  width: 30px; height: 30px; flex-shrink: 0

[이미지 옆 텍스트 — 사이드바 펼침 시만 표시]

"Co-Create AI":
  font-size: 13px; font-weight: 700
  color: #1E2A35; letter-spacing: -0.01em
  white-space: nowrap

플랫폼 서브타이틀:
  font-size: 9px; font-weight: 500
  letter-spacing: 0.06em; text-transform: uppercase
  color: rgba(30,42,53,0.45)
  margin-top: 1px; white-space: nowrap

전환: collapsed → 0 opacity (100ms) → expanded 1 opacity (200ms, delay 150ms)
```

### 8-C. 사용 원칙

- 사이드바: 로고 이미지 + 텍스트, gap `10px`
- 다크 배경 → 흰 텍스트 / 라이트 배경 → `#1E2A35`
- 로고 최소 크기: `24px`

---

## 9. 제품 데모 영상 시퀀스

### Scene 1: 오프닝 — 앱 등장 (0–3초)
- **화면:** `#FAFBFC` 라이트 배경, 사이드바 fade-in
- **효과:** 로고 + "Co-Create AI" 텍스트 slide-in
- **무드:** 깨끗하고 전문적인 첫인상

### Scene 2: 사이드바 인터랙션 (3–7초)
- **화면:** 사이드바 64px → hover → 220px 펼침 (300ms ease)
- **강조:** 액티브 스프린트 박스 등장 (emerald 틴트), 프로그레스 바 67%
- **뱃지:** Conflicts `3` (coral), Sprints `1` 등장

### Scene 3: 대시보드 KPI (7–13초)
- **화면:** Hub 선택 → KPI 타일 4개 stagger fade-in (0.1s 간격)
- **수치:** `3` / `12` / `91%` / `2d` — 28px, 700wt, fg1
- **효과:** `fadeIn 0.3s cubic-bezier(0.2,0,0,1)`

### Scene 4: 워크스페이스 진입 (13–18초)
- **화면:** Sprints 클릭 → 워크스페이스 slide-in
- **레이아웃:** 3열 구조 등장 (좌측/캔버스/우측)
- **캔버스:** 점선 emerald 보더 나타남

### Scene 5: 마커 배치 & AI 분석 (18–25초)
- **화면:** 캔버스 위 마커 3개 순서대로 등장 (coral → emerald → amber)
- **우측:** "Request AI Analysis" 버튼 클릭 → option-glow 시작
- **KPI 타일:** 갈등 정보 / 포지션 / 대안 제안 순서대로 fade-in

### Scene 6: 합의 완료 (25–30초)
- **화면:** 투표 옵션 카드에 option-glow 적용 (AI 추천)
- **효과:** 프로그레스 바 0% → 100% 채움 (emerald-500)
- **상태:** "All approved" 뱃지 (emerald) + pulse-dot
- **클로징:** 사이드바 Conflicts 카운터 3 → 2 → 변경

---

## 부록: 그림자 시스템

| 클래스 | 값 | 용도 |
|--------|----|------|
| `shadow-xs` | `0 1px 2px 0 rgba(30,42,53,0.06)` | 카드 기본 |
| `shadow-sm` | `0 1px 3px 0 rgba(30,42,53,0.10), 0 1px 2px -1px rgba(30,42,53,0.08)` | 버튼, 인풋 |
| `shadow-md` | `0 4px 8px -2px rgba(30,42,53,0.10), 0 2px 4px -2px rgba(30,42,53,0.08)` | 드롭다운 |
| `shadow-lg` | `0 12px 24px -4px rgba(30,42,53,0.12), 0 4px 8px -4px rgba(30,42,53,0.08)` | 모달 |
| `shadow-xl` | `0 24px 48px -8px rgba(30,42,53,0.16)` | 플로팅 요소 |
| `shadow-focus` | `0 0 0 3px rgba(6,182,212,0.25)` | 인풋 포커스 링 |

---

## 부록: 보더 라디우스

| 값 | 용도 |
|----|------|
| `2px` | 미세 요소 |
| `4px` | 뱃지, 컴팩트 버튼, 아바타 (정사각형), 스프린트 박스 |
| `6px` | 카드 (컴팩트), 인풋, KPI 타일 |
| `8px` | 카드 (일반), 채팅 버블, 워크스페이스 캔버스 |
| `12px` | 카드 (큰 것), 모달 |
| `9999px` | 상태 뱃지, 숫자 뱃지 (pill) |

---

*Co-Create AI App Design Guide v1.0 | 2026-05-12*
