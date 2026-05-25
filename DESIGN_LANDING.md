# Co-Create AI — Landing Page Design Guide

> **목적:** 마케팅·프로모션 영상 제작용 디자인 가이드.
> 랜딩 페이지(`LandingPage.jsx`)의 시각적 언어만 다룬다.
> 앱 내부 화면은 `DESIGN_APP.md` 참조. 통합본은 `DESIGN_FULL.md` 참조.

---

## 1. 색상 팔레트

### 1-A. Emerald / Cyan (브랜드 주 색상 — Primary)

랜딩 전반에서 AI·혁신·활성 상태를 상징하는 핵심 색상.

| 토큰 | Hex | 용도 |
|------|-----|------|
| `emerald-700` | `#0e7490` | 라이트 모드 CTA 호버 |
| `emerald-600` | `#0891b2` | CTA 버튼 호버 (다크 모드) |
| `emerald-500` | `#06b6d4` | **메인 브랜드 컬러** — CTA, 뱃지, 이탤릭 강조 |
| `emerald-200` | `#a5f3fc` | 보더 강조 |
| `emerald-50`  | `#ecfeff` | 배경 틴트 |

**그라디언트:**
```
/* 히어로 글로우 (다크) */
radial-gradient(ellipse, rgba(6,182,212,0.15) 0%, transparent 70%)

/* 히어로 글로우 (라이트) */
radial-gradient(ellipse, rgba(6,182,212,0.12) 0%, transparent 70%)

/* 피처 카드 상단 라인 (hover) */
linear-gradient(90deg, transparent, #06b6d4, transparent)

/* 최종 CTA 배경 글로우 */
radial-gradient(ellipse 60% 80% at 50% 50%, rgba(6,182,212,0.08) 0%, transparent 70%)
```

---

### 1-B. Slate Neutrals (공통 뉴트럴)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `slate-900` | `#1E2A35` | 라이트 모드 텍스트 |
| `slate-700` | `#6b7280` | 보조 텍스트 |
| `slate-200` | `#C5D0D9` | 보더 |
| `slate-25`  | `#FAFBFC` | 페이지 기본 배경 |

---

### 1-C. Coral (충돌·경고)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `coral-500` | `#D05045` | 경고, 충돌 뱃지 |
| `coral-50`  | `#FDF4F3` | 배경 틴트 |

---

### 1-D. Amber (리드 유저·포인트)

| 토큰 | Hex | 용도 |
|------|-----|------|
| `amber-500` | `#C88A1A` | 앰버 마커, 리드 강조 |
| `amber-50`  | `#FFFBF0` | 배경 틴트 |

---

### 1-E. 랜딩 다크 모드 (메인 테마)

랜딩 페이지 기본 테마. 딥 다크 네이비 기반.

| CSS 변수 | Hex | 용도 |
|----------|-----|------|
| `--bg`   | `#0a1628` | **메인 배경** |
| `--bg2`  | `#0f1e30` | 섹션 배경 (Stats, Features) |
| `--bg3`  | `#14243a` | 3차 배경 |
| `--txt`  | `#f0f4f8` | 메인 텍스트 |
| `--muted`| `#7a9bb5` | 보조 텍스트, 링크 |
| `--border`| `rgba(255,255,255,0.07)` | 구분선 |
| `--em`   | `#06b6d4` | Emerald 변수 |
| `--em-d` | `#0891b2` | Emerald 다크 (hover) |
| `--em-l` | `rgba(6,182,212,0.12)` | Emerald 틴트 |
| 사이드바/목업 | `#071220` | 앱 목업 사이드바 배경 |
| 목업 내부 | `#0d1b2e` | 앱 목업 메인 배경 |

---

### 1-F. 랜딩 라이트 모드

| CSS 변수 | Hex | 용도 |
|----------|-----|------|
| `--bg`   | `#f8fafc` | 메인 배경 |
| `--bg2`  | `#f1f5f9` | 섹션 배경 |
| `--bg3`  | `#e2e8f0` | 3차 배경 |
| `--txt`  | `#0f172a` | 메인 텍스트 |
| `--muted`| `#64748b` | 보조 텍스트 |
| `--border`| `rgba(15,23,42,0.1)` | 구분선 |

---

## 2. 타이포그래피

### 2-A. 폰트 패밀리

| 용도 | 폰트 | 소스 |
|------|------|------|
| **디스플레이 제목** | `Fraunces` | Google Fonts: `ital,wght@0,300;0,400;1,300;1,400` |
| **본문·버튼·UI** | `DM Sans` | Google Fonts: `wght@300;400;500` |
| **앱 목업 내부** | `DM Sans` | (동일) |

**Fraunces 특성:**
- 세리프체, light(300) 사용으로 우아하고 고급스러운 느낌
- 이탤릭(`<em>`) 사용 시 유기적이고 부드러운 곡선 — 핵심 키워드 강조에 사용
- 대형 숫자에도 사용 (stat-num, how-num)

**Import 코드:**
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
```

---

### 2-B. 랜딩 전용 크기

| 요소 | 크기 | 폰트 | 웨이트 |
|------|------|------|--------|
| 히어로 h1 | `clamp(48px, 6.5vw, 82px)` | Fraunces | 300 |
| 섹션 h2 | `clamp(32px, 4vw, 50px)` | Fraunces | 300 |
| CTA h2 | `clamp(36px, 5vw, 60px)` | Fraunces | 300 |
| stat-num (수치) | `52px` | Fraunces | 300 |
| how-num (단계번호) | `56px` | Fraunces | 300 |
| 부제 (p) | `17px–18px` | DM Sans | 400 |
| 네비 링크 | `14px` | DM Sans | 400 |
| 뱃지 텍스트 | `13px` | DM Sans | 400 |
| 피처 카드 제목 | `17px` | DM Sans | 500 |
| 피처 카드 설명 | `14px` | DM Sans | 400 |
| 푸터 | `13px` | DM Sans | 400 |

**letter-spacing:**
- 히어로 h1: `-2px`
- 섹션 h2: `-1px`
- CTA h2: `-1.5px`

---

## 3. 랜딩 레이아웃

### 3-A. 전체 페이지 구조

```
┌─────────────────────────────────────────────────────┐
│  Fixed Navbar (height: 64px)                        │
│  scrollY>40 → backdrop-blur(16px) + border-bottom   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Hero Section (min-height: 100vh)                   │
│  padding: 120px 48px 80px                           │
│  text-align: center                                 │
│  [hero-glow] [grid-bg]                              │
│                                                     │
├─────────────────────────────────────────────────────┤
│  Stats Row (background: --bg2, border top/bottom)   │
│  4열 grid, padding: 40px 20px each                  │
├─────────────────────────────────────────────────────┤
│  How It Works (padding: 100px 48px)                 │
│  3열 grid, text-align: center                       │
├─────────────────────────────────────────────────────┤
│  Features (padding: 100px 48px, bg: --bg2)          │
│  3×2 카드 grid, max-width: 1060px                   │
├─────────────────────────────────────────────────────┤
│  Final CTA (padding: 120px 48px)                    │
│  radial gradient glow 배경                          │
├─────────────────────────────────────────────────────┤
│  Footer (padding: 36px 60px)                        │
└─────────────────────────────────────────────────────┘
```

---

### 3-B. Fixed Navbar

```
height: 64px
padding: 0 48px
position: fixed, top:0, z-index:100

[스크롤 이전 scrollY ≤ 40]
  background: transparent
  backdrop-filter: none
  border-bottom: none

[스크롤 후 scrollY > 40]
  background: rgba(15,22,36,0.92)  [다크]
             rgba(248,250,252,0.92) [라이트]
  backdrop-filter: blur(16px)
  border-bottom: 1px solid rgba(6,182,212,0.12) [다크]
                            rgba(6,182,212,0.20) [라이트]
  transition: all 0.3s ease

구성: [로고] ← [링크들] → [테마 토글] [Log in] [Get started]
```

---

### 3-C. Hero Section

```
min-height: 100vh
padding: 120px 48px 80px
display: flex, flex-direction: column, align-items: center
text-align: center
position: relative, overflow: hidden

배경 레이어 (아래→위):
  1. hero-glow: 방사형 emerald 광원
     width:900px, height:600px, border-radius:50%
     top:-100px, left:50%, transform:translateX(-50%)
  2. grid-bg: 60×60px 격자 텍스처 (emerald 4% 불투명도)
     mask: radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 70%)

콘텐츠 순서 (위→아래):
  [뱃지 pill] → [h1] → [p 부제] → [버튼 행] → [앱 목업]
```

---

### 3-D. Stats Row

```
display: grid; grid-template-columns: repeat(4,1fr)
max-width: 860px; margin: 0 auto; gap: 0

각 stat-item:
  padding: 40px 20px
  border-right: 1px solid var(--border)
  마지막 아이템: border-right: none
  text-align: center

stat-num: Fraunces, 52px, 300wt, color: var(--em)
stat-label: 14px, DM Sans, color: var(--muted)
```

---

### 3-E. Features Grid

```
display: grid; grid-template-columns: repeat(3,1fr)
gap: 20px; max-width: 1060px; margin: 0 auto
```

---

## 4. 랜딩 전용 컴포넌트

### 4-A. Primary Button (CTA)

```
display: inline-flex; align-items: center; gap: 8px
padding: 14px 28px (일반) / 8px 18px (네비) / 14px 32px (큰 CTA)
border-radius: 10px
background: var(--em)  [#06b6d4]
color: white
font-size: 15px (일반) / 14px (네비) / 16px (큰 CTA)
font-weight: 500; font-family: DM Sans
border: none
transition: all 0.2s

hover:
  background: var(--em-d)  [#0891b2]
  transform: translateY(-2px)
  box-shadow: 0 8px 24px rgba(6,182,212,0.3)
```

### 4-B. Ghost Button

```
display: inline-flex; align-items: center; gap: 8px
padding: 14px 28px / 8px 18px (네비) / 14px 32px (큰 CTA)
border-radius: 10px
background: transparent
color: var(--txt)
border: 1px solid var(--ghost-border)
  [다크: rgba(255,255,255,0.18)] [라이트: rgba(15,23,42,0.18)]
font-size: 15px / 14px (네비) / 16px (큰 CTA)
font-weight: 400; font-family: DM Sans
transition: all 0.2s

hover:
  border-color: var(--em)
  background: var(--ghost-hover-bg)
    [다크: rgba(255,255,255,0.05)] [라이트: rgba(15,23,42,0.06)]
```

### 4-C. Theme Toggle Button

```
width: 40px; height: 40px; border-radius: 10px
border: 1px solid var(--ghost-border)
background: transparent; color: var(--txt)
display: inline-flex; align-items: center; justify-content: center
transition: all 0.2s

hover:
  border-color: var(--em)
  background: var(--ghost-hover-bg)

아이콘: 태양(☀️, 다크모드일 때) / 달(🌙, 라이트모드일 때) — 20×20px SVG
```

### 4-D. Landing Badge (Pill)

```
display: inline-flex; align-items: center; gap: 8px
padding: 6px 14px; border-radius: 999px
border: 1px solid rgba(6,182,212,0.35)
background: rgba(6,182,212,0.08)
font-size: 13px; color: var(--em)
font-family: DM Sans

내부 pulse dot:
  width: 6px; height: 6px; border-radius: 50%
  background: var(--em)
  animation: landing-pulse 2s infinite
```

### 4-E. Feature Card

```
background: var(--bg2)
border: 1px solid var(--border)
border-radius: 16px; padding: 30px
transition: all 0.3s; position: relative; overflow: hidden

상단 gradient line (::after 가상 요소):
  position: absolute; top:0; left:0; right:0; height:1px
  background: linear-gradient(90deg, transparent, var(--em), transparent)
  opacity: 0; transition: opacity 0.3s

hover:
  border-color: rgba(6,182,212,0.25)
  transform: translateY(-5px)
  ::after opacity: 1

feat-icon:
  width: 44px; height: 44px; border-radius: 11px
  background: var(--em-l); border: 1px solid rgba(6,182,212,0.2)
  display: flex; align-items: center; justify-content: center
  margin-bottom: 18px

feat-title: 17px, 500wt, font-family: DM Sans
feat-desc: 14px, line-height:1.75, color: var(--muted)
```

### 4-F. App Mockup (브라우저 창 미니 UI)

히어로 섹션 하단에 표시되는 앱 미리보기.

```
외부 프레임:
  max-width: 960px; border-radius: 18px
  border: 1px solid var(--border)
  box-shadow: 0 48px 96px rgba(0,0,0,0.35), 0 0 0 1px rgba(6,182,212,0.05)

브라우저 바 (mockup-bar):
  padding: 12px 16px; display: flex; align-items: center; gap: 6px
  background: #071220 [다크] / #e2e8f0 [라이트]
  border-bottom: 1px solid rgba(255,255,255,0.08)

  macOS dots:
    빨강 #ff5f57 / 노랑 #ffbd2e / 초록 #28c840 — 10×10px, border-radius:50%

  URL 바:
    flex:1; padding:3px 12px; font-size:11px; border-radius:5px
    background: rgba(255,255,255,0.05) [다크] / rgba(255,255,255,0.85) [라이트]
    text: "app.example.com/project/purifier-01/sprints"

앱 내부 (mockup-inner):
  background: #0d1b2e [다크] / #f8fafc [라이트]
  min-height: 400px; font-family: DM Sans

  좌측 패널 (mockup-sidebar):
    background: #071220 [다크] / #1e2b3c [라이트]
    border-right: 1px solid rgba(255,255,255,0.07)

    — 스프린트 타임라인 dots (활성:emerald glow, 비활성:rgba(255,255,255,0.15))
    — 디자인 캔버스 (dashed emerald 보더, 3개 마커: coral/emerald/amber)
    — 팀 채팅 버블 (background: rgba(255,255,255,0.08), border-radius: 8px)

  우측 패널 (ws-right-panel):
    width: 124px; background: rgba(0,0,0,0.12) [다크]
    
    — AI Analysis 버튼: emerald-500 배경, 흰 텍스트, 8px 폰트
    — KPI 타일 3개: 갈등 정보, 포지션, 대안 제안
```

### 4-G. 히어로 시각 효과

#### hero-glow
```
position: absolute
width: 900px; height: 600px; border-radius: 50%
background: radial-gradient(ellipse, rgba(6,182,212,0.15) 0%, transparent 70%)
top: -100px; left: 50%; transform: translateX(-50%)
pointer-events: none
```

#### grid-bg (격자 텍스처)
```
position: absolute; inset: 0
background-image:
  linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px),
  linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)
background-size: 60px 60px
mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 70%)
pointer-events: none

[라이트 모드]: rgba(6,182,212,0.08) (조금 더 진하게)
```

---

## 5. 랜딩 전용 애니메이션

### 5-A. Easing

| 용도 | Easing |
|------|--------|
| 랜딩 전반 | `ease` |
| 버튼 호버 | `0.2s ease` |
| 카드 호버 | `0.3s ease` |

---

### 5-B. landing-fadeUp (초기 등장)

히어로 섹션 요소들이 아래서 위로 나타나는 효과.

```
@keyframes landing-fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

적용 순서 (delay):
  뱃지:        landing-fadeUp 0.6s ease both           (0s)
  h1:          landing-fadeUp 0.6s 0.1s ease both
  p 부제:      landing-fadeUp 0.6s 0.2s ease both
  버튼 행:     landing-fadeUp 0.6s 0.3s ease both
  앱 목업:     landing-fadeUp 0.9s 0.4s ease both
```

---

### 5-C. reveal (스크롤 등장)

IntersectionObserver로 트리거되는 섹션별 등장.

```
초기 상태:
  opacity: 0; transform: translateY(32px)
  transition: opacity 0.7s ease, transform 0.7s ease

.visible 클래스 추가 시:
  opacity: 1; transform: translateY(0)

IntersectionObserver: threshold 0.15

delay variants:
  .reveal-d1: transition-delay 0.1s
  .reveal-d2: transition-delay 0.2s
  .reveal-d3: transition-delay 0.3s

stagger (Stats/How/Features):
  각 아이템: transitionDelay `${index * 0.1}s`
```

---

### 5-D. landing-pulse (pulse dot)

뱃지 내부 작은 녹색 점의 맥박 효과.

```
@keyframes landing-pulse {
  0%,100% { opacity:1; transform:scale(1) }
  50%     { opacity:0.4; transform:scale(1.4) }
}
animation: landing-pulse 2s infinite
```

---

### 5-E. 네비바 스크롤 전환

```
scrollY > 40 감지 → 배경/blur/border 전환
transition: all 0.3s ease
```

---

### 5-F. 호버 효과 요약

| 요소 | 효과 |
|------|------|
| Primary CTA 버튼 | `translateY(-2px)` + `box-shadow: 0 8px 24px rgba(6,182,212,0.3)` |
| Ghost 버튼 | border emerald 변경 + 배경 틴트 |
| 피처 카드 | `translateY(-5px)` + 상단 emerald gradient line 등장 |
| 네비 링크 | `color: var(--muted) → var(--txt)` |
| Theme 토글 | border emerald 변경 + 배경 틴트 |

---

## 6. 브랜드 톤앤매너

### 6-A. 핵심 가치

| 키워드 | 설명 |
|--------|------|
| **Industry 5.0** | 인간과 AI의 공존 협업. 기계가 일방적으로 결정하지 않고 인간의 가치 판단을 AI가 보조 |
| **Decision Clarity** | 갈등을 구조화해 제거하는 명료한 플랫폼 |
| **Collaborative** | 디자이너·엔지니어·사용자 등 다양한 역할이 한 스프린트 안에서 공존 |
| **Professional Modern** | 스타트업 느낌보다 엔터프라이즈 정밀함. 차갑지 않되 무게감 있는 전문성 |

---

### 6-B. 랜딩 시각적 언어

- **배경:** 딥 다크 네이비(`#0a1628`) — 차갑고 신비로운 기술 공간
- **액센트:** Emerald/Cyan — AI, 합의, 디지털 정보 흐름을 상징하는 차갑고 정교한 컬러
- **텍스처:** 60×60px 격자 — 공학적이고 기술적인 분위기
- **글로우:** 히어로 radial glow — AI 에너지, 혁신의 원천
- **이탤릭:** Fraunces 이탤릭 + Emerald 컬러 = 핵심 메시지 강조

---

### 6-C. 영상 제작 분위기

```
조명:    차갑고 푸른 ambient light, 포인트는 cyan/teal
무드:    밤의 테크 오피스, 정밀한 작업, 조용한 집중
모션:    빠른 시작 → 부드러운 감속 (easeOut)
속도:    성급하지 않음. 정보가 차례로 쌓이는 느낌
색온도:  쿨 화이트~블루, 포인트에 amber
공간감:  충분한 여백, 정보 밀도는 높음
슬로건:  "Where design teams reach consensus faster"
```

---

## 7. 랜딩 화면 구성 상세

### 7-A. 전체 섹션별 배경·보더

| 섹션 | 배경 (다크) | 보더 |
|------|-------------|------|
| Hero | `#0a1628` | — |
| Stats Row | `#0f1e30` | 상하단 `rgba(255,255,255,0.07)` |
| How It Works | `#0a1628` | — |
| Features | `#0f1e30` | 상단 `rgba(255,255,255,0.07)` |
| Final CTA | `#0a1628` | — |
| Footer | `#0a1628` | 상단 `rgba(255,255,255,0.07)` |

---

### 7-B. Hero Section 상세

```
[뱃지]
  "● AI-powered design collaboration"
  style: pill, emerald 틴트, 13px DM Sans, pulse dot

[h1 — Fraunces 300, clamp(48px,6.5vw,82px), letter-spacing:-2px]
  "Where design teams"
  "reach consensus faster"
  ↑ 'consensus' → <em style="font-style:italic; color:var(--em)">

[p — DM Sans, 18px, var(--muted), max-width:520px, line-height:1.75]
  "Structured decision sprints that resolve conflicts..."

[버튼 행 — gap:14px]
  [Start for free →]  (btn-primary + 화살표 아이콘)
  [See how it works]  (btn-ghost, href:"#features")

[앱 목업 프리뷰]
  최대 폭 960px, 브라우저 창 형태
  내부: Sprint Workspace 미니 UI
```

---

### 7-C. Stats Row 상세

```
수치 4개 (Fraunces 52px, 300wt, emerald):
  3×  → "faster decisions"
  91% → "avg consensus rate"
  50% → "fewer revision cycles"
  ∞   → "AI-powered sprints"
```

---

### 7-D. How It Works (3단계)

```
섹션 배지: "How it works" pill
h2: "Three steps to consensus" (Fraunces, 300wt)

how-num: Fraunces, 56px, 300wt, rgba(6,182,212,0.2) — 배경처럼 사용
how-title: 16px, 500wt, DM Sans
how-desc: 14px, 400wt, var(--muted), line-height:1.7

01. Set your North Star
02. Sprint through conflicts
03. Reach consensus
```

---

### 7-E. Features Grid (6개 카드)

```
feat-icon 색상: var(--em) [emerald]
아이콘 종류 (Heroicons):
  1. Decision Sprints — circle-check
  2. AI Analysis — sparkles (별)
  3. Value Conflict Matrix — table
  4. Real-time Collaboration — users-group
  5. Design Upload & Markers — photo
  6. North Star Alignment — star
```

---

### 7-F. Final CTA 섹션

```
배경: radial-gradient(ellipse 60% 80% at 50% 50%, rgba(6,182,212,0.08) 0%, transparent 70%)

h2 (Fraunces, clamp(36px,5vw,60px), 300wt):
  "Ready to end"
  "decision gridlock?"
  ↑ 'decision gridlock?' → <em style="font-style:italic; color:var(--em)">

[Start free today →]  (btn-primary, 14px 32px padding, 16px font)
[Log in]              (btn-ghost, 14px 32px padding)
```

---

## 8. 로고 사용 가이드

### 8-A. 로고 파일

| 파일 | 경로 | 용도 |
|------|------|------|
| `logo-v2.png` | `/public/assets/logo-v2.png` | 사이드바, 기본 앱 로고 (30×30px) |
| `logo-transparent.png` | `/public/assets/logo-transparent.png` | 투명 배경 필요 시 |

### 8-B. 랜딩 텍스트 로고 스펙

```
[C]  Co-Create AI
     DECISION SPRINT PLATFORM

[C] 박스:
  Navbar: width/height 34px, border-radius 8px
  Footer: width/height 28px, border-radius 7px
  background: var(--em)  [#06b6d4]
  color: white
  font-weight: 700; font-family: DM Sans

"Co-Create AI":
  font-size: 15px; font-weight: 500; font-family: DM Sans

"DECISION SPRINT PLATFORM":
  font-size: 9px; color: var(--muted)
  letter-spacing: 1.2px; text-transform: uppercase
```

### 8-C. 사용 원칙

- 로고와 텍스트 사이 최소 `gap: 10px`
- 다크 배경 → 흰 텍스트 / 라이트 배경 → `#1E2A35`
- 로고 단독 사용 시 emerald-500 박스 안에 표시

---

## 9. 마케팅 영상 제작 — 씬별 가이드

### Scene 1: 오프닝 (0–3초)
- **배경:** `#0a1628` 딥 다크 네이비 — 어둠 속 정적
- **효과:** 중앙에서 emerald radial glow 천천히 확장 (`rgba(6,182,212,0.15)`)
- **텍스트:** "Co-Create AI" (Fraunces Light, `#f0f4f8`) → 서서히 fade-in
- **분위기:** 우주에서 한 점의 빛이 퍼져나오는 느낌. 배경에 grid-bg 미세하게 등장

### Scene 2: 문제 제기 (3–8초)
- **배경:** `#0a1628` 유지
- **화면:** 그리드 격자 위 두 아바타 (cyan `#06b6d4` vs gray `#6b7280`) 충돌 표현
- **효과:** Coral pulse-ring 애니메이션 — `rgba(208,80,69,0.6)` → 0으로 퍼져나감
- **텍스트:** "Design teams struggle with" + coral `#D05045` 강조 "conflict"
- **수치:** 뱃지 `"Conflicts: 3"` 등장

### Scene 3: 플랫폼 등장 (8–15초)
- **화면:** 앱 목업이 `slide-in` (translateX(16px) → 0)으로 등장
- **내부:** 워크스페이스 UI가 레이어별로 순차 fade-in
  - 사이드바 → 캔버스 → 마커 3개 (coral, emerald, amber) → 채팅
- **색상:** Emerald glow로 전환, 사이드바 `#071220`

### Scene 4: AI 분석 (15–22초)
- **화면:** "Request AI Analysis" 버튼 — `background: #06b6d4` — 클릭 효과
- **효과:** option-glow 애니메이션:
  `box-shadow: 0 0 0 2px rgba(6,182,212,0.4)` ↔ `0 0 0 3px rgba(6,182,212,0.7)` (2.5s 반복)
- **수치:** 그래프·KPI 타일들이 stagger fade-in (0.1s 간격)
- **색상:** 전체 Emerald `#06b6d4` 주조

### Scene 5: 합의 (22–28초)
- **화면:** 투표 완료 화면 → 프로그레스 바 0% → 100% (emerald `#06b6d4`)
- **효과:** 수치들이 아래→위 rising 애니메이션 (landing-fadeUp 계열)
- **수치:** 대형 표시:
  - `91%` (Fraunces, 52px, emerald) — "avg consensus rate"
  - `3×` (Fraunces, 52px, emerald) — "faster decisions"
- **배경:** 방사형 emerald glow 확장

### Scene 6: 클로징 (28–30초)
- **배경:** `#0a1628` + grid-bg 격자 서서히 등장
- **중앙:** 로고 (`[C]` 박스, emerald-500) + "Co-Create AI" (Fraunces, 큰 사이즈)
- **하단:** "Decision Sprint Platform" (Uppercase, muted, letter-spacing: 0.15em)
- **CTA:** "Start for free" 버튼 (btn-primary 스타일) 등장
- **마무리:** hero-glow 서서히 fade-out → 정적

---

## 부록: 그림자 시스템

| 클래스 | 값 | 용도 |
|--------|----|------|
| `shadow-xs` | `0 1px 2px 0 rgba(30,42,53,0.06)` | 카드 기본 |
| `shadow-sm` | `0 1px 3px 0 rgba(30,42,53,0.10), 0 1px 2px -1px rgba(30,42,53,0.08)` | 버튼, 인풋 |
| `shadow-md` | `0 4px 8px -2px rgba(30,42,53,0.10), 0 2px 4px -2px rgba(30,42,53,0.08)` | 드롭다운 |
| `shadow-lg` | `0 12px 24px -4px rgba(30,42,53,0.12), 0 4px 8px -4px rgba(30,42,53,0.08)` | 모달 |
| `shadow-xl` | `0 24px 48px -8px rgba(30,42,53,0.16)` | 앱 목업 (라이트 모드) |
| `shadow-mockup` | `0 48px 96px rgba(0,0,0,0.35), 0 0 0 1px rgba(6,182,212,0.05)` | 목업 (다크 모드) |
| `shadow-focus` | `0 0 0 3px rgba(6,182,212,0.25)` | 포커스 링 |

---

## 부록: 보더 라디우스

| 값 | 용도 |
|----|------|
| `2px` | 미세 요소 |
| `4px` | 컴팩트 뱃지, 뉴트럴 요소 |
| `6px` | 앱 카드, URL 바 |
| `8px` | 버블, 캔버스, 목업 내부 |
| `10px` | 랜딩 버튼 |
| `11px` | feat-icon 박스 |
| `16px` | feat-card |
| `18px` | 앱 목업 외부 프레임 |
| `999px` | 랜딩 뱃지 (pill) |

---

*Co-Create AI Landing Design Guide v1.0 | 2026-05-12*
