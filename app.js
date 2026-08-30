const categories = [
  { name: '외형 프롬프트', icon: '외형' },
  { name: 'ooc', icon: 'OOC' },
  { name: '유저 노트', icon: '노트' },
  { name: '앵캐 추천', icon: '추천' },
  { name: '자료실', icon: '자료' }
];

const legacyCategoryNames = {
  '공지사항': '외형 프롬프트',
  '자유게시판': 'ooc',
  '정보공유': '유저 노트',
  '정보 공유': '유저 노트',
  '질문답변': '앵캐 추천',
  '질문 답변': '앵캐 추천'
};

const seedPosts = [
  { id: 'demo-1', category: '외형 프롬프트', title: '커뮤니티 이용 안내', content: '서로의 취향과 기록을 존중해 주세요.\n\n작성한 글은 본인이 직접 수정할 수 있으며, 편집자는 게시판 전체를 관리할 수 있습니다.', author_name: '관리자', author_id: 'demo', is_notice: true, view_count: 128, created_at: '2026-08-28T09:00:00+09:00', updated_at: '2026-08-28T09:00:00+09:00' },
  { id: 'demo-2', category: '유저 노트', title: '처음 오신 분들을 위한 게시판 사용법', content: '왼쪽 카테고리에서 원하는 게시판을 고르거나 상단 검색창에서 제목과 내용을 검색할 수 있어요.', author_name: '관리자', author_id: 'demo', is_notice: true, view_count: 83, created_at: '2026-08-27T11:30:00+09:00', updated_at: '2026-08-27T11:30:00+09:00' },
  { id: 'demo-3', category: 'ooc', title: '오늘의 첫 번째 기록', content: 'GitHub Pages와 Supabase를 연결하면 여러 사람이 같은 게시판에 글을 남길 수 있습니다.', author_name: '유현', author_id: 'demo', is_notice: false, view_count: 24, created_at: '2026-08-26T20:12:00+09:00', updated_at: '2026-08-26T20:12:00+09:00' },
  { id: 'demo-4', category: '앵캐 추천', title: '이미지도 글에 첨부할 수 있나요?', content: '다음 단계에서 Supabase Storage를 연결하면 이미지 첨부도 추가할 수 있어요.', author_name: '무헌', author_id: 'demo', is_notice: false, view_count: 17, created_at: '2026-08-25T18:40:00+09:00', updated_at: '2026-08-25T18:40:00+09:00' },
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
let retainedImageUrls = [];
let pendingImageFiles = [];
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
  supabase = createClient(boardConfig.supabaseUrl, boardConfig.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage
    }
  });
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
  const authDisplayName = currentUser.user_metadata?.display_name?.trim();
  const { data } = await supabase.from('community_profiles').select('id, display_name, role').eq('id', currentUser.id).maybeSingle();
  if (data) {
    currentProfile = { ...data, display_name: authDisplayName || data.display_name };
    return;
  }

  const newProfile = {
    id: currentUser.id,
    display_name: authDisplayName || currentUser.email?.split('@')[0] || '회원',
    role: 'member'
  };
  const { data: createdProfile, error } = await supabase
    .from('community_profiles')
    .insert(newProfile)
    .select('id, display_name, role')
    .single();
  currentProfile = error ? newProfile : createdProfile;
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
    posts = (data || []).map((post) => ({
      ...post,
      category: legacyCategoryNames[post.category] || post.category
    }));
    memberCount = count ?? null;
  }
  renderAll();
}

function applyFilters() {
  const query = searchTerm.toLocaleLowerCase('ko');
  filteredPosts = posts.filter((post) => {
    const categoryMatch = selectedCategory === '전체글' || post.category === selectedCategory;
    const textMatch = !query || `${post.title} ${post.content} ${post.author_name} ${(post.tags || []).join(' ')}`.toLocaleLowerCase('ko').includes(query);
    return categoryMatch && textMatch;
  });
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  return [...new Set(source.map((tag) => String(tag).trim().replace(/^#+/, '')).filter(Boolean))]
    .slice(0, 8)
    .map((tag) => tag.slice(0, 24));
}

function renderTags(tags) {
  return normalizeTags(tags).map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('');
}

function renderImageEditor() {
  const existing = retainedImageUrls.map((url, index) => `
    <div class="image-editor-item">
      <img src="${escapeHtml(url)}" alt="첨부 이미지 미리보기">
      <button type="button" data-remove-existing-image="${index}">삭제</button>
    </div>
  `);
  const pending = pendingImageFiles.map((file, index) => `
    <div class="image-editor-item is-pending">
      <span>${escapeHtml(file.name)}</span>
      <button type="button" data-remove-pending-image="${index}">삭제</button>
    </div>
  `);
  $('#imageEditorList').innerHTML = [...existing, ...pending].join('');
}

async function uploadPendingImages() {
  if (!pendingImageFiles.length) return [...retainedImageUrls];
  if (!supabase || !currentUser) throw new Error('로그인 후 이미지를 업로드할 수 있습니다.');
  const imageUrls = [...retainedImageUrls];
  for (const file of pendingImageFiles) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const path = `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from('community-images').upload(path, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    const { data } = supabase.storage.from('community-images').getPublicUrl(path);
    imageUrls.push(data.publicUrl);
  }
  return imageUrls;
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
      <span class="post-title" role="cell"><span class="post-title-text">${post.is_notice ? '<span class="pin">●</span>' : ''}${post.image_urls?.length ? '<span class="image-indicator">▣</span>' : ''}${escapeHtml(post.title)}</span>${post.tags?.length ? `<span class="post-tags">${renderTags(post.tags)}</span>` : ''}</span>
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
  button.textContent = currentUser ? `${currentProfile?.display_name || '회원'} · 프로필` : '로그인';
}

function openProfile() {
  if (!currentUser) return;
  $('#profileEmail').value = currentUser.email || '';
  $('#profileDisplayName').value = currentProfile?.display_name || currentUser.email?.split('@')[0] || '';
  $('#profileRole').textContent = currentProfile?.role || 'member';
  $('#profileMessage').textContent = '';
  $('#profileDialog').showModal();
}

async function saveProfile(event) {
  event.preventDefault();
  const displayName = $('#profileDisplayName').value.trim();
  const message = $('#profileMessage');
  if (!displayName || displayName.length > 20) {
    message.textContent = '작성자 이름은 1~20자로 입력해주세요.';
    return;
  }
  message.textContent = '저장 중...';
  try {
    const { data, error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
    if (error) throw error;
    const { error: postsError } = await supabase
      .from('community_posts')
      .update({ author_name: displayName, updated_at: new Date().toISOString() })
      .eq('author_id', currentUser.id);
    if (postsError) throw postsError;
    currentUser = data.user || currentUser;
    currentProfile = { ...(currentProfile || {}), id: currentUser.id, display_name: displayName, role: currentProfile?.role || 'member' };
    await loadPosts();
    updateAuthButton();
    message.textContent = '프로필을 저장했습니다.';
    setTimeout(() => $('#profileDialog').open && $('#profileDialog').close(), 500);
  } catch (error) {
    message.textContent = error.message || '프로필을 저장하지 못했습니다.';
  }
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
  $('#postCategory').value = post?.category || (selectedCategory !== '전체글' ? selectedCategory : 'ooc');
  $('#postAuthor').value = post?.author_name || currentProfile?.display_name || '';
  $('#postAuthor').readOnly = Boolean(isConfigured && currentProfile?.display_name);
  $('#postTitle').value = post?.title || '';
  $('#postTags').value = normalizeTags(post?.tags).map((tag) => `#${tag}`).join(' ');
  retainedImageUrls = Array.isArray(post?.image_urls) ? [...post.image_urls] : [];
  pendingImageFiles = [];
  $('#postImages').value = '';
  renderImageEditor();
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
  $('#viewerTags').innerHTML = renderTags(selectedPost.tags);
  $('#viewerTags').hidden = normalizeTags(selectedPost.tags).length === 0;
  const imageUrls = Array.isArray(selectedPost.image_urls) ? selectedPost.image_urls : [];
  $('#viewerImages').innerHTML = imageUrls.map((url) => `<img src="${escapeHtml(url)}" alt="${escapeHtml(selectedPost.title)} 첨부 이미지" loading="lazy">`).join('');
  $('#viewerImages').hidden = imageUrls.length === 0;
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
    tags: normalizeTags($('#postTags').value),
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
    payload.image_urls = await uploadPendingImages();
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
  $('#postImages').addEventListener('change', (event) => {
    const available = Math.max(0, 5 - retainedImageUrls.length - pendingImageFiles.length);
    const selected = [...event.target.files];
    const valid = selected.filter((file) => file.type.startsWith('image/') && file.size <= 8 * 1024 * 1024).slice(0, available);
    pendingImageFiles.push(...valid);
    if (valid.length !== selected.length) $('#editorMessage').textContent = '이미지는 최대 5장, 한 장당 8MB 이하로 올려주세요.';
    event.target.value = '';
    renderImageEditor();
  });
  $('#imageEditorList').addEventListener('click', (event) => {
    const existingButton = event.target.closest('[data-remove-existing-image]');
    const pendingButton = event.target.closest('[data-remove-pending-image]');
    if (existingButton) retainedImageUrls.splice(Number(existingButton.dataset.removeExistingImage), 1);
    if (pendingButton) pendingImageFiles.splice(Number(pendingButton.dataset.removePendingImage), 1);
    if (existingButton || pendingButton) renderImageEditor();
  });
  $('#editPostButton').addEventListener('click', () => openEditor(selectedPost));
  $('#deletePostButton').addEventListener('click', deleteSelectedPost);
  $('#loginButton').addEventListener('click', async () => {
    if (!isConfigured) return alert('현재는 데모 모드예요. config.js에 Supabase 정보를 입력하면 로그인을 사용할 수 있어요.');
    if (currentUser) { openProfile(); return; }
    $('#loginDialog').showModal();
  });
  $('#loginForm').addEventListener('submit', submitLogin);
  $('#profileForm').addEventListener('submit', saveProfile);
  $('#profileLogoutButton').addEventListener('click', async () => {
    $('#profileDialog').close();
    await supabase.auth.signOut();
  });
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

