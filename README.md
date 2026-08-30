# 우리들의 아카이브

GitHub Pages에 공개하고 Supabase에 게시글을 저장하는 공동 편집 게시판입니다.

## 들어 있는 기능

- 카테고리별 게시글 목록
- 제목·내용·작성자 통합 검색
- 공지글과 일반글
- 이메일 링크 로그인
- 글쓰기, 본인 글 수정·삭제
- 편집자의 전체 글 수정
- 관리자의 전체 글 수정·삭제
- 모바일 반응형 화면
- Supabase 연결 전 로컬 데모 모드

## 1. Supabase 만들기

1. <https://supabase.com>에서 새 프로젝트를 만듭니다.
2. `SQL Editor`를 열고 `supabase-schema.sql`의 내용을 전부 붙여 넣어 실행합니다.
3. `Project Settings → API`에서 Project URL과 anon public key를 복사합니다.
4. `config.js`를 열어 아래 두 칸에 붙여 넣습니다.

```js
window.BOARD_CONFIG = {
  supabaseUrl: 'https://프로젝트주소.supabase.co',
  supabaseAnonKey: 'anon-public-key',
  siteName: '원하는 홈페이지 이름'
};
```

`anon key`는 브라우저에서 사용하는 공개 키입니다. 데이터 보호는 `supabase-schema.sql`에 들어 있는 RLS 권한 규칙이 담당합니다. `service_role` 키는 절대 넣지 마세요.

## 2. 로그인 주소 등록하기

Supabase의 `Authentication → URL Configuration`에서 다음 값을 등록합니다.

- Site URL: `https://내아이디.github.io/저장소이름/`
- Redirect URLs: `https://내아이디.github.io/저장소이름/**`

## 3. GitHub Pages에 올리기

1. GitHub에서 새 공개 저장소를 만듭니다.
2. 이 폴더 안의 파일들을 저장소 최상단에 올립니다.
3. 저장소의 `Settings → Pages`로 이동합니다.
4. `Deploy from a branch`를 선택합니다.
5. Branch는 `main`, 폴더는 `/(root)`를 선택하고 저장합니다.

잠시 후 `https://내아이디.github.io/저장소이름/`에서 홈페이지가 열립니다.

저장소에 파일을 다시 올리면 포함된 GitHub Pages 작업이 새 버전을 자동으로 공개합니다. 저장소의 `Settings → Pages`에서 Source가 `GitHub Actions`로 표시되면 그대로 두면 됩니다.

## 먼저 화면만 확인하기

Supabase를 만들기 전에도 `index.html`을 더블 클릭하면 데모 게시판을 바로 확인할 수 있습니다. 이때 작성한 글은 해당 브라우저에만 저장됩니다.

## 카테고리 바꾸기

`app.js` 맨 위의 `categories` 목록을 수정하면 됩니다. Supabase의 `posts.category`는 문자열이라 별도의 데이터베이스 수정은 필요하지 않습니다.

## 편집자와 관리자 지정하기

먼저 해당 사용자가 이메일 로그인을 한 번 해야 합니다. 그다음 Supabase SQL Editor에서 `supabase-schema.sql` 맨 아래에 있는 편집자 또는 관리자 지정 문장의 이메일을 바꾸어 실행합니다.

- `member`: 자기 글 작성·수정·삭제
- `editor`: 모든 글 작성·수정 및 공지 등록
- `admin`: 모든 글 작성·수정·삭제 및 공지 등록

## 데모 모드

`config.js`의 Supabase 값이 비어 있으면 브라우저의 localStorage를 이용한 데모 모드로 열립니다. 데모 글은 해당 기기에서만 보이며 다른 사람과 공유되지 않습니다.
