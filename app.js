const categories = [
  { name: '공지사항', icon: '공지' },
  { name: '자유게시판', icon: '자유' },
  { name: '정보공유', icon: '정보' },
  { name: '질문답변', icon: 'Q&A' },
  { name: '자료실', icon: '자료' }
];

const seedPosts = [
  { id: 'demo-1', category: '공지사항', title: '커뮤니티 이용 안내', content: '서로의 취향과 기록을 존중해 주세요.\n\n작성한 글은 본인이 직접 수정할 수 있으며, 편집자는 게시판 전체를 관리할 수 있습니다.', author_name: '관리자', author_id: 'demo', is_notice: true, view_count: 128, created_at: '2026-08-28T09:00:00+09:00', updated_at: '2026-08-28T09:00:00+09:00' },
  { id: 'demo-2', category: '정보공유', title: '처음 오신 분들을 위한 게시판 사용법', content: '왼쪽 카테고리에서 원하는 게시판을 고르거나 상단 검색창에서 제목과 내용을 검색할 수 있어요.', author_name: '관리자', author_id: 'demo', is_notice: true, view_count: 83, created_at: '2026-08-27T11:30:00+09:00', updated_at: '2026-08-27T11:30:00+09:00' },
  { id: 'demo-3', category: '자유게시판', title: '오늘의 첫 번째 기록', content: 'GitHub Pages와 Supabase를 연결하면 여러 사람이 같은 게시판에 글을 남길 수 있습니다.', author_name: '유현', author_id: 'demo', is_notice: false, view_count: 24, created_at: '2026-08-26T20:12:00+09:00', updated_at: '2026-08-26T20:12:00+09:00' },
  { id: 'demo-4', category: '질문답변', title: '이미지도 글에 첨부할 수 있나요?', content: '다음 단계에서 Supabase Storage를 연결하면 이미지 첨부도 추가할 수 있어요.', author_name: '무헌', author_id: 'demo', is_notice: false, view_count: 17, created_at: '2026-08-25T18:40:00+09:00', updated_at: '2026-08-25T18:40:00+09:00' },
  { id: 'demo-5', category: '자료실', title: '공유 자료 모음', content: '자료의 출처와 사용 범위를 함께 적어주세요.', author_name: '아카이브', author_id: 'demo', is_notice: false, view_count: 9, created_at: '2026-08-24T14:05:00+09:00', updated_at: '2026-08-24T14:05:00+09:00' }
];

const boardConfig = window.BOARD_CONFIG || {};
const isConfigured = Boolean(boardConfig.supabaseUrl && boardConfig.supabaseAnonKey);
const storageKey = 'githubCommunityBoardDemoPosts';
const pageSize = 10;

let supabase = null;
let currentUser = null;
let currentProfile = null;
let posts = [];
let filteredPosts = [];
let selectedCategory = '전체글';
let searchTerm = '';
let currentPage = 1;
let selectedPost = null;
let memberCount = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readDemoPosts() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved) ? saved : [...seedPosts];
  } catch {
    return [...seedPosts];
  }
}

function saveDemoPosts() {
  localStorage.setItem(storageKey, JSON.stringify(posts));
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date).replace(/\. /g, '.').replace('.', '').trim();
}

function formatFullDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function roleCanEditAll() {
  return currentProfile && ['admin', 'editor'].includes(currentProfile.role);
}

function roleIsAdmin() {
  return currentProfile && currentProfile.role === 'admin';
}

function canEdit(post) {
  if (!isConfigured) return true;
  return Boolean(currentUser && (post.author_id === currentUser.id || roleCanEditAll()));
}

function canDelete(post) {
  if (!isConfigured) return true;
  return Boolean(currentUser && (post.author_id === currentUser.id || roleIsAdmin()));
}

async function initSupabase() {
  if (!isConfigured) return;
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = createClient(boardConfig.supabaseUrl, boardConfig.supabaseAnonKey);
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  await loadProfile();
  supabase.auth.onAuthStateChange(async (_event, sessionValue) => {
    currentUser = sessionValue?.user || null;
    await loadProfile();
    updateAuthButton();
  });
}

async function loadProfile() {
  currentProfile = null;
  if (!supabase || !currentUser) return;
  const { data } = await supabase.from('community_profiles').select('id, display_name, role').eq('id', currentUser.id).maybeSingle();
  currentProfile = data || { id: currentUser.id, display_name: currentUser.email?.split('@')[0] || '회원', role: 'member' };
}

async function loadPosts() {
  if (!supabase) {
    posts = readDemoPosts();
    memberCount = new Set(posts.map((post) => post.author_name)).size;
  } else {
    const [{ data, error }, { count }] = await Promise.all([
      supabase.from('community_posts').select('*').order('is_notice', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('community_profiles').select('*', { count: 'exact', head: true })
    ]);
    if (error) throw error;
    posts = data || [];
    memberCount = count ?? null;
  }
  renderAll();
}

function applyFilters() {
  const query = searchTerm.toLocaleLowerCase('ko');
  filteredPosts = posts.filter((post) => {
    const categoryMatch = selectedCategory === '전체글' || post.category === selectedCategory;
    const textMatch = !query || `${post.title} ${post.content} ${post.author_name}`.toLocaleLowerCase('ko').includes(query);
    return categoryMatch && textMatch;
  });
}

function renderCategories() {
  const counts = Object.fromEntries(categories.map(({ name }) => [name, posts.filter((post) => post.category === name).length]));
  $('#categoryList').innerHTML = [
    `<button class="category-button ${selectedCategory === '전체글' ? 'is-active' : ''}" type="button" data-category="전체글"><span>전체글보기</span><em>${posts.length}</em></button>`,
    ...categories.map(({ name }) => `<button class="category-button ${selectedCategory === name ? 'is-active' : ''}" type="button" data-category="${escapeHtml(name)}"><span>${escapeHtml(name)}</span><em>${counts[name] || 0}</em></button>`)
  ].join('');
}

function renderPosts() {
  applyFilters();
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const pagePosts = filteredPosts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  $('#postList').innerHTML = pagePosts.map((post) => `
    <div class="post-row post-item ${post.is_notice ? 'is-notice' : ''}" role="row" tabindex="0" data-post-id="${escapeHtml(post.id)}">
      <span class="post-category" role="cell">${post.is_notice ? '공지' : escapeHtml(post.category)}</span>
      <span class="post-title" role="cell">${post.is_notice ? '<span class="pin">●</span>' : ''}${escapeHtml(post.title)}</span>
      <span class="post-author" role="cell">${escapeHtml(post.author_name)}</span>
      <span class="post-date" role="cell">${formatDate(post.created_at)}</span>
      <span class="post-views" role="cell">${Number(post.view_count || 0).toLocaleString('ko-KR')}</span>
    </div>
  `).join('');
  $('#emptyState').hidden = pagePosts.length > 0;
  renderPagination(totalPages);
  renderNotices();
}

function renderNotices() {
  const notices = posts.filter((post) => post.is_notice).slice(0, 2);
  const strip = $('#noticeStrip');
  if (!notices.length || selectedCategory !== '전체글' || searchTerm) {
    strip.hidden = true;
    return;
  }
  strip.innerHTML = notices.map((post) => `<button type="button" data-post-id="${escapeHtml(post.id)}"><b>공지</b> ${escapeHtml(post.title)}</button>`).join('');
  strip.hidden = false;
}

function renderPagination(totalPages) {
  $('#pagination').innerHTML = Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => `<button class="page-button ${page === currentPage ? 'is-active' : ''}" type="button" data-page="${page}">${page}</button>`).join('');
}

function renderHeader() {
  $('#postCount').textContent = posts.length.toLocaleString('ko-KR');
  $('#memberCount').textContent = memberCount === null ? '—' : memberCount.toLocaleString('ko-KR');
  $('#boardTitle').textContent = searchTerm ? `'${searchTerm}' 검색 결과` : selectedCategory === '전체글' ? '전체글보기' : selectedCategory;
  $('#boardEyebrow').textContent = searchTerm ? 'SEARCH RESULT' : selectedCategory === '전체글' ? 'ALL POSTS' : 'CATEGORY';
  updateAuthButton();
}

function renderAll() {
  renderCategories();
  renderPosts();
  renderHeader();
  $('#postCategory').innerHTML = categories.map(({ name }) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
}

function updateAuthButton() {
  const button = $('#loginButton');
  if (!isConfigured) {
    button.textContent = '데모 모드';
    return;
  }
  button.textContent = currentUser ? `${currentProfile?.display_name || '회원'} · 로그아웃` : '로그인';
}

function setCategory(category) {
  selectedCategory = category;
  searchTerm = '';
  currentPage = 1;
  $('#searchInput').value = '';
  $$('.nav-item').forEach((button) => button.classList.toggle('is-active', (category === '전체글' && button.dataset.view === 'all') || button.dataset.category === category));
  renderAll();
}

function openEditor(post = null) {
  if (isConfigured && !currentUser) {
    $('#loginDialog').showModal();
    return;
  }
  selectedPost = post;
  $('#editorTitle').textContent = post ? '글 수정' : '새 글 작성';
  $('#postId').value = post?.id || '';
  $('#postCategory').value = post?.category || (selectedCategory !== '전체글' ? selectedCategory : '자유게시판');
  $('#postAuthor').value = post?.author_name || currentProfile?.display_name || '';
  $('#postAuthor').readOnly = Boolean(isConfigured && currentProfile?.display_name);
  $('#postTitle').value = post?.title || '';
  $('#postContent').value = post?.content || '';
  $('#postNotice').checked = Boolean(post?.is_notice);
  $('#postNotice').disabled = Boolean(isConfigured && !roleCanEditAll());
  $('#editorMessage').textContent = '';
  $('#viewerDialog').close();
  $('#editorDialog').showModal();
}

async function openViewer(id) {
  selectedPost = posts.find((post) => String(post.id) === String(id));
  if (!selectedPost) return;
  if (supabase) {
    const { error } = await supabase.rpc('community_increment_post_views', { post_id_value: selectedPost.id });
    if (!error) selectedPost.view_count = Number(selectedPost.view_count || 0) + 1;
  } else {
    selectedPost.view_count = Number(selectedPost.view_count || 0) + 1;
    saveDemoPosts();
  }
  $('#viewerCategory').textContent = selectedPost.is_notice ? '공지' : selectedPost.category;
  $('#viewerTitle').textContent = selectedPost.title;
  $('#viewerMeta').textContent = `${selectedPost.author_name} · ${formatFullDate(selectedPost.created_at)} · 조회 ${Number(selectedPost.view_count || 0).toLocaleString('ko-KR')}`;
  $('#viewerContent').textContent = selectedPost.content;
  $('#editPostButton').hidden = !canEdit(selectedPost);
  $('#deletePostButton').hidden = !canDelete(selectedPost);
  $('#viewerDialog').showModal();
  renderAll();
}

async function savePost(event) {
  event.preventDefault();
  const id = $('#postId').value;
  const original = posts.find((post) => String(post.id) === String(id));
  const payload = {
    category: $('#postCategory').value,
    title: $('#postTitle').value.trim(),
    content: $('#postContent').value.trim(),
    author_name: $('#postAuthor').value.trim(),
    is_notice: $('#postNotice').checked,
    updated_at: new Date().toISOString()
  };
  if (!payload.title || !payload.content || !payload.author_name) {
    $('#editorMessage').textContent = '빈칸을 모두 채워주세요.';
    return;
  }
  try {
    if (supabase) {
      if (id) {
        if (!canEdit(original)) throw new Error('수정 권한이 없습니다.');
        const { error } = await supabase.from('community_posts').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('community_posts').insert({ ...payload, author_id: currentUser.id });
        if (error) throw error;
      }
    } else if (id) {
      posts = posts.map((post) => String(post.id) === String(id) ? { ...post, ...payload } : post);
      saveDemoPosts();
    } else {
      posts.unshift({ ...payload, id: `demo-${Date.now()}`, author_id: 'demo', view_count: 0, created_at: new Date().toISOString() });
      saveDemoPosts();
    }
    $('#editorDialog').close();
    await loadPosts();
  } catch (error) {
    $('#editorMessage').textContent = error.message || '저장하지 못했습니다.';
  }
}

async function deleteSelectedPost() {
  if (!selectedPost || !canDelete(selectedPost) || !confirm('이 글을 삭제할까요?')) return;
  if (supabase) {
    const { error } = await supabase.from('community_posts').delete().eq('id', selectedPost.id);
    if (error) return alert(error.message);
  } else {
    posts = posts.filter((post) => String(post.id) !== String(selectedPost.id));
    saveDemoPosts();
  }
  $('#viewerDialog').close();
  selectedPost = null;
  await loadPosts();
}

async function submitLogin(event) {
  event.preventDefault();
  const message = $('#loginMessage');
  if (!supabase) {
    message.textContent = '먼저 config.js에 Supabase 주소와 키를 입력해주세요.';
    return;
  }
  const { error } = await supabase.auth.signInWithOtp({ email: $('#loginEmail').value.trim(), options: { emailRedirectTo: location.href.split('#')[0] } });
  message.textContent = error ? error.message : '메일함에서 로그인 링크를 눌러주세요.';
}

function bindEvents() {
  $('#categoryList').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (button) setCategory(button.dataset.category);
  });
  $('.community-nav').addEventListener('click', (event) => {
    const button = event.target.closest('.nav-item');
    if (button) setCategory(button.dataset.category || '전체글');
  });
  $('#searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    searchTerm = $('#searchInput').value.trim();
    currentPage = 1;
    renderAll();
  });
  $('#postList').addEventListener('click', (event) => {
    const row = event.target.closest('[data-post-id]');
    if (row) openViewer(row.dataset.postId);
  });
  $('#postList').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const row = event.target.closest('[data-post-id]');
      if (row) { event.preventDefault(); openViewer(row.dataset.postId); }
    }
  });
  $('#noticeStrip').addEventListener('click', (event) => {
    const button = event.target.closest('[data-post-id]');
    if (button) openViewer(button.dataset.postId);
  });
  $('#pagination').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (button) { currentPage = Number(button.dataset.page); renderPosts(); window.scrollTo({ top: $('.board-card').offsetTop - 100, behavior: 'smooth' }); }
  });
  $('#writeButton').addEventListener('click', () => openEditor());
  $('#postForm').addEventListener('submit', savePost);
  $('#editPostButton').addEventListener('click', () => openEditor(selectedPost));
  $('#deletePostButton').addEventListener('click', deleteSelectedPost);
  $('#loginButton').addEventListener('click', async () => {
    if (!isConfigured) return alert('현재는 데모 모드예요. config.js에 Supabase 정보를 입력하면 로그인을 사용할 수 있어요.');
    if (currentUser) { await supabase.auth.signOut(); return; }
    $('#loginDialog').showModal();
  });
  $('#loginForm').addEventListener('submit', submitLogin);
  $('#mobileCategoryToggle').addEventListener('click', () => {
    const list = $('#categoryList');
    const collapsed = list.classList.toggle('is-collapsed');
    $('#mobileCategoryToggle').textContent = collapsed ? '펼치기' : '접기';
    $('#mobileCategoryToggle').setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog).close()));
  $$('.modal').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
}

async function start() {
  if (boardConfig.siteName) {
    document.title = boardConfig.siteName;
    $('.brand strong').textContent = boardConfig.siteName;
    $('.site-footer span').textContent = boardConfig.siteName;
  }
  bindEvents();
  try {
    await initSupabase();
    await loadPosts();
  } catch (error) {
    console.error(error);
    posts = readDemoPosts();
    renderAll();
    alert('Supabase 연결에 실패해 데모 모드로 열었습니다. config.js 설정을 확인해주세요.');
  }
}

start();

