const state = {
  zoomStudent: null,
  courses: {
    regular: { students: [], pdfDoc: null, loadingPdf: null, pdfJs: null },
    private: { students: [], pdfDoc: null, loadingPdf: null, pdfJs: null }
  }
};

const $ = id => document.getElementById(id);
const normalize = value => String(value ?? '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
const safeFilePart = value => normalize(value).slice(0, 40) || 'student';

async function loadCourseData(course) {
  const file = course === 'private' ? 'private-students.json' : 'students.json';
  const response = await fetch(file, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Could not load ${file}`);
  state.courses[course].students = await response.json();
}

function matchesStudent(student, query, course) {
  const nq = normalize(query);
  if (!nq) return false;
  if (course === 'private') {
    return normalize(student.name).includes(nq) ||
      normalize(student.registrationNo).includes(nq) ||
      normalize(student.father).includes(nq) ||
      normalize(student.slNo).includes(nq);
  }
  return normalize(student.name).includes(nq) ||
    normalize(student.classRoll).includes(nq) ||
    normalize(student.admissionRoll).includes(nq) ||
    normalize(student.registrationNo).includes(nq) ||
    (nq.length === 3 && normalize(student.classRoll).endsWith(nq));
}

function courseLabel(course) {
  return course === 'private' ? 'PRIVATE COURSE' : 'REGULAR COURSE';
}

function render(course, query = '') {
  const config = state.courses[course];
  const results = $(`${course}Results`);
  const status = $(`${course}Status`);
  const q = String(query).trim();

  if (!q) {
    status.textContent = '';
    results.innerHTML = '<div class="empty">সার্চ বক্সে তথ্য লিখুন।</div>';
    return;
  }

  const hits = config.students.filter(student => matchesStudent(student, q, course));
  status.textContent = hits.length
    ? `${hits.length} জন পাওয়া গেছে — প্রতিটির কার্ড নিচে Preview করুন`
    : 'কোনো matching student পাওয়া যায়নি।';

  if (!hits.length) {
    results.innerHTML = `<div class="empty">এই তথ্য দিয়ে ${courseLabel(course)}-এর কোনো Registration Card পাওয়া যায়নি।</div>`;
    return;
  }

  results.innerHTML = hits.map((student, index) => {
    const tag = course === 'private'
      ? `Private Course · Page ${student.page}`
      : `${student.inStudentList ? 'Student List-এ আছে' : 'Student List-এর বাইরে · Card-এ আছে'} · Page ${student.page}`;
    const rollLine = course === 'private'
      ? `<span>Sl No: ${esc(student.slNo || '—')}</span>`
      : `<span>Class Roll: ${esc(student.classRoll || '—')}</span><span>Admission Roll: ${esc(student.admissionRoll || '—')}</span>`;

    return `<article class="result">
      <div class="preview-wrap">
        <div class="corner-mark" title="এই কার্ডটি দেখুন">✓</div>
        <div class="preview" id="${course}Preview-${index}"><div class="preview-loading">কার্ড Preview হচ্ছে…</div></div>
        <button class="zoom" data-index="${index}" type="button">🔍 বড় করে দেখুন</button>
      </div>
      <div class="identity">
        <div class="name">${esc(student.name)}</div>
        <div class="meta">
          <span>পিতা: ${esc(student.father || '—')}</span>
          ${rollLine}
          <span>Registration No: ${esc(student.registrationNo || '—')}</span>
        </div>
        <span class="tag">${tag}</span>
        <div class="action-row">
          <button class="download" data-index="${index}" type="button">PDF Download</button>
          <button class="share-card" data-index="${index}" type="button">📤 Share</button>
        </div>
        <div class="image-downloads">
          <button class="jpg-download" data-index="${index}" type="button">🖼️ JPG Download</button>
          <button class="png-download" data-index="${index}" type="button">🖼️ PNG Download</button>
        </div>
        <div class="image-share-row">
          <button class="jpg-share" data-index="${index}" type="button">📤 Share JPG</button>
          <button class="png-share" data-index="${index}" type="button">📤 Share PNG</button>
        </div>
      </div>
    </article>`;
  }).join('');

  hits.forEach((student, index) => renderPreview(course, student, index));
  results.querySelectorAll('.download').forEach(button => {
    button.onclick = () => downloadCard(course, hits[Number(button.dataset.index)], button);
  });
  results.querySelectorAll('.share-card').forEach(button => {
    button.onclick = () => shareCard(course, hits[Number(button.dataset.index)], button);
  });
  results.querySelectorAll('.jpg-download').forEach(button => {
    button.onclick = () => downloadCardImage(course, hits[Number(button.dataset.index)], 'jpg', button);
  });
  results.querySelectorAll('.png-download').forEach(button => {
    button.onclick = () => downloadCardImage(course, hits[Number(button.dataset.index)], 'png', button);
  });
  results.querySelectorAll('.jpg-share').forEach(button => {
    button.onclick = () => shareCardImage(course, hits[Number(button.dataset.index)], 'jpg', button);
  });
  results.querySelectorAll('.png-share').forEach(button => {
    button.onclick = () => shareCardImage(course, hits[Number(button.dataset.index)], 'png', button);
  });
  results.querySelectorAll('.zoom').forEach(button => {
    button.onclick = () => openZoom(course, hits[Number(button.dataset.index)]);
  });
}

async function ensurePdf(course) {
  const config = state.courses[course];
  if (config.pdfDoc) return config.pdfDoc;
  if (!config.loadingPdf) {
    config.loadingPdf = (async () => {
      const file = course === 'private' ? 'private-registration-cards.pdf' : 'registration-cards.pdf';
      const response = await fetch(file, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not load ${file}`);
      const bytes = await response.arrayBuffer();
      config.pdfDoc = await PDFLib.PDFDocument.load(bytes);
      return config.pdfDoc;
    })();
  }
  return config.loadingPdf;
}

async function ensurePdfJs(course) {
  const config = state.courses[course];
  if (config.pdfJs) return config.pdfJs;
  if (!config.pdfJs) {
    config.pdfJs = (async () => {
      if (!window.pdfjsLib) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const file = course === 'private' ? 'private-registration-cards.pdf' : 'registration-cards.pdf';
      const response = await fetch(file, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Could not load ${file}`);
      return window.pdfjsLib.getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise;
    })();
  }
  return config.pdfJs;
}

async function renderPreview(course, student, index, large = false) {
  const box = $(large ? 'zoomPreview' : `${course}Preview-${index}`);
  if (!box) return;
  if (isMessengerWebView()) {
    box.innerHTML = '<div class="preview-loading">Messenger-এর ভেতরে PDF Preview বন্ধ রাখা হয়েছে। ব্রাউজারে খুলে Preview/Download করুন।</div>';
    return;
  }
  try {
    const pdf = await ensurePdfJs(course);
    const page = await pdf.getPage(Number(student.page));
    const base = page.getViewport({ scale: 1 });
    const width = large ? Math.min(window.innerWidth - 36, 900) : Math.min(360, Math.max(280, box.clientWidth || 320));
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.className = 'pdf-canvas';
    box.innerHTML = '';
    box.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    if (!large) {
      let zoom = 1;
      const controls = document.createElement('div');
      controls.className = 'preview-zoom-corner';
      controls.innerHTML = '<button type="button" class="zoom-minus" title="ছোট করুন">−</button><button type="button" class="zoom-plus" title="জুম করুন">＋</button><button type="button" class="zoom-reset" title="স্বাভাবিক আকার">1×</button>';
      box.parentElement.appendChild(controls);
      const applyZoom = () => { canvas.style.transform = `scale(${zoom})`; };
      controls.querySelector('.zoom-plus').onclick = () => { zoom = Math.min(3, +(zoom + 0.25).toFixed(2)); applyZoom(); };
      controls.querySelector('.zoom-minus').onclick = () => { zoom = Math.max(0.5, +(zoom - 0.25).toFixed(2)); applyZoom(); };
      controls.querySelector('.zoom-reset').onclick = () => { zoom = 1; applyZoom(); };
    }
  } catch (error) {
    box.innerHTML = '<div class="preview-loading">Preview লোড করা যায়নি। Download বাটন ব্যবহার করুন।</div>';
    console.error(error);
  }
}

function openZoom(course, student) {
  state.zoomStudent = { course, student };
  const modal = $('modal');
  $('modalTitle').textContent = student.name;
  const extra = course === 'private'
    ? `Father: ${student.father || '—'} · Sl No: ${student.slNo || '—'} · Registration No: ${student.registrationNo || '—'}`
    : `Father: ${student.father || '—'} · Class Roll: ${student.classRoll || '—'} · Admission Roll: ${student.admissionRoll || '—'} · Registration No: ${student.registrationNo || '—'}`;
  $('modalInfo').textContent = `${courseLabel(course)} · ${extra}`;
  $('zoomPreview').innerHTML = '<div class="preview-loading">বড় Preview হচ্ছে…</div>';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  renderPreview(course, student, 0, true);
}

function closeZoom() {
  $('modal').classList.remove('show');
  $('modal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function getZoomCanvas() {
  return $('zoomPreview')?.querySelector('canvas.pdf-canvas') || null;
}

function downloadRenderedZoomImage(type) {
  const info = state.zoomStudent;
  if (isMessengerWebView()) {
    if (info) showDownloadFallback(info.course, info.student, type.toUpperCase());
    return;
  }
  const canvas = getZoomCanvas();
  if (!info || !canvas) {
    alert('কার্ডটি আগে পুরোপুরি Preview হতে দিন।');
    return;
  }
  const mime = type === 'png' ? 'image/png' : 'image/jpeg';
  const quality = type === 'jpg' ? 0.96 : undefined;
  canvas.toBlob(blob => {
    if (!blob) {
      alert('ছবিটি তৈরি করা যায়নি।');
      return;
    }
    const filename = `registration-card-${info.course}-${safeFilePart(info.student.registrationNo)}-${safeFilePart(info.student.name)}.${type}`;
    triggerDownload(blob, filename);
  }, mime, quality);
}

function setupZoomActions() {
  $('zoomPdfOpen').onclick = () => {
    if (state.zoomStudent) openCoursePdf(state.zoomStudent.course, state.zoomStudent.student);
  };
  $('zoomJpgDownload').onclick = () => downloadRenderedZoomImage('jpg');
  $('zoomPngDownload').onclick = () => downloadRenderedZoomImage('png');
}

async function makePdfBlob(course, student) {
  const source = await ensurePdf(course);
  const output = await PDFLib.PDFDocument.create();
  const [page] = await output.copyPages(source, [Number(student.page) - 1]);
  output.addPage(page);
  const bytes = await output.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

function isMessengerWebView() {
  return /FBAN|FBAV|Messenger|Instagram/i.test(navigator.userAgent || '');
}

function currentSiteUrl() {
  const url = new URL(location.href);
  url.hash = '';
  return url;
}

function browserSearchUrl() {
  const url = currentSiteUrl();
  const params = new URLSearchParams(url.search);
  const regularInput = String($('regularSearch')?.value || '').trim();
  const privateInput = String($('privateSearch')?.value || '').trim();
  const regularQuery = regularInput || params.get('regular') || '';
  const privateQuery = privateInput || params.get('private') || '';
  url.search = '';
  if (regularQuery) url.searchParams.set('regular', regularQuery);
  if (privateQuery) url.searchParams.set('private', privateQuery);
  return url.toString();
}

function openInNewTab(url) {
  return window.open(url, '_blank', 'noopener,noreferrer');
}

function openCoursePdf(course, student) {
  if (isMessengerWebView()) {
    showDownloadFallback(course, student, 'PDF');
    return;
  }
  const file = course === 'private' ? 'private-registration-cards.pdf' : 'registration-cards.pdf';
  openInNewTab(`${file}#page=${Number(student.page)}`);
}

function openInBrowser() {
  const opened = openInNewTab(browserSearchUrl());
  if (!opened) {
    alert('Messenger-এর ভেতরের Browser নতুন উইন্ডো খুলতে না দিলে Messenger-এর ⋮ মেনু থেকে “Open in browser/Chrome” নির্বাচন করুন।');
  }
}

function showDownloadFallback(course, student, kind = 'PDF') {
  const old = $('downloadFallback');
  if (old) old.remove();

  const wrap = document.createElement('div');
  wrap.id = 'downloadFallback';
  wrap.className = 'download-fallback';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `<div class="fallback-backdrop"></div>
    <div class="fallback-dialog">
      <button type="button" class="fallback-x" aria-label="বন্ধ করুন">✕</button>
      <div class="fallback-icon">⚠️</div>
      <strong>Messenger Browser</strong>
      <p>Messenger-এর ভেতর থেকে ডাউনলোডের সুবিধা Meta বন্ধ করে দিয়েছে। ডাউনলোড করতে নিচের <b>‘Open in Browser’</b> বাটনে ক্লিক করে ব্রাউজারে ওয়েবসাইটটি খুলুন এবং সেখান থেকে ডাউনলোড করুন।</p>
      <div class="fallback-actions">
        <button type="button" class="fallback-site">🌐 Open in Browser</button>
        <button type="button" class="fallback-close">বন্ধ করুন</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelector('.fallback-x').onclick = close;
  wrap.querySelector('.fallback-close').onclick = close;
  wrap.querySelector('.fallback-site').onclick = openInBrowser;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return url;
}

function openBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const win = openInNewTab(url);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (!win) return false;
  return true;
}

async function downloadCard(course, student, button) {
  if (isMessengerWebView()) {
    showDownloadFallback(course, student, 'PDF');
    return;
  }
  const old = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const blob = await makePdfBlob(course, student);
    const filename = `registration-card-${course}-${safeFilePart(student.registrationNo)}-${safeFilePart(student.name)}.pdf`;
    triggerDownload(blob, filename);
    if (isMessengerWebView()) showDownloadFallback(course, student, 'PDF');
  } catch (error) {
    alert('PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।');
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

async function shareCard(course, student, button) {
  if (isMessengerWebView()) {
    showDownloadFallback(course, student, 'PDF');
    return;
  }
  const old = button.textContent;
  button.disabled = true;
  button.textContent = 'শেয়ার হচ্ছে…';
  try {
    const blob = await makePdfBlob(course, student);
    const filename = `registration-card-${course}-${safeFilePart(student.registrationNo)}-${safeFilePart(student.name)}.pdf`;
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        title: `${courseLabel(course)} Registration Card`,
        text: `${student.name} — Registration No: ${student.registrationNo || '—'}`,
        files: [file]
      });
    } else if (navigator.share) {
      await navigator.share({
        title: `${courseLabel(course)} Registration Card`,
        text: `${student.name} — Registration No: ${student.registrationNo || '—'}`,
        url: location.href
      });
    } else {
      triggerDownload(blob, filename);
      if (isMessengerWebView()) showDownloadFallback(course, student, 'PDF');
      else alert('এই Browser-এ Direct Share সাপোর্ট নেই। PDF ফাইলটি Download হয়েছে।');
    }
  } catch (error) {
    if (error && error.name !== 'AbortError') {
      console.error(error);
      alert('Share করা যায়নি। আবার চেষ্টা করুন।');
    }
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

async function renderImageBlob(course, student, type) {
  const pdf = await ensurePdfJs(course);
  const page = await pdf.getPage(Number(student.page));
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  await page.render({ canvasContext: context, viewport }).promise;

  const mime = type === 'png' ? 'image/png' : 'image/jpeg';
  const quality = type === 'jpg' ? 0.96 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image conversion failed')), mime, quality);
  });
}


async function shareCardImage(course, student, type, button) {
  if (isMessengerWebView()) {
    showDownloadFallback(course, student, type.toUpperCase());
    return;
  }
  const old = button.textContent;
  button.disabled = true;
  button.textContent = 'তৈরি হচ্ছে…';
  try {
    const blob = await renderImageBlob(course, student, type);
    const filename = `registration-card-${course}-${safeFilePart(student.registrationNo)}-${safeFilePart(student.name)}.${type}`;
    const file = new File([blob], filename, { type: type === 'png' ? 'image/png' : 'image/jpeg' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({
        title: `${courseLabel(course)} Registration Card`,
        text: `${student.name} — Registration No: ${student.registrationNo || '—'}`,
        files: [file]
      });
    } else if (navigator.share) {
      await navigator.share({
        title: `${courseLabel(course)} Registration Card`,
        text: `${student.name} — Registration No: ${student.registrationNo || '—'}`,
        url: currentSiteUrl()
      });
    } else if (isMessengerWebView()) {
      openBlob(blob, filename);
      alert(`${type.toUpperCase()} ফাইলটি Browser-এ খুলে দেওয়া হয়েছে। Messenger WebView-তে না খুললে ⋮ → Open in browser/Chrome ব্যবহার করুন।`);
    } else {
      triggerDownload(blob, filename);
      alert(`${type.toUpperCase()} ফাইলটি Download করা হয়েছে।`);
    }
  } catch (error) {
    if (error && error.name !== 'AbortError') {
      console.error(error);
      alert(`${type.toUpperCase()} Share করা যায়নি। আবার চেষ্টা করুন।`);
    }
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

async function downloadCardImage(course, student, type, button) {
  if (isMessengerWebView()) {
    showDownloadFallback(course, student, type.toUpperCase());
    return;
  }
  const old = button.textContent;
  button.disabled = true;
  button.textContent = 'তৈরি হচ্ছে…';
  try {
    const blob = await renderImageBlob(course, student, type);
    const filename = `registration-card-${course}-${safeFilePart(student.registrationNo)}-${safeFilePart(student.name)}.${type}`;
    triggerDownload(blob, filename);
    if (isMessengerWebView()) showDownloadFallback(course, student, type.toUpperCase());
  } catch (error) {
    alert('ছবিটি তৈরি করা যায়নি। আবার চেষ্টা করুন।');
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

function setupCourse(course) {
  const input = $(`${course}Search`);
  const clear = $(`${course}Clear`);
  const searchButton = $(`${course}SearchBtn`);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') render(course, input.value);
  });
  searchButton.addEventListener('click', () => render(course, input.value));
  clear.addEventListener('click', () => {
    input.value = '';
    render(course);
    input.focus();
  });
}

$('closeModal').onclick = closeZoom;
$('modal').addEventListener('click', event => { if (event.target === $('modal')) closeZoom(); });
setupZoomActions();
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeZoom(); });

setupCourse('regular');
setupCourse('private');

const initialParams = new URLSearchParams(location.search);
const initialRegularQuery = initialParams.get('regular') || '';
const initialPrivateQuery = initialParams.get('private') || '';
$('regularSearch').value = initialRegularQuery;
$('privateSearch').value = initialPrivateQuery;


Promise.all([loadCourseData('regular'), loadCourseData('private')])
  .then(() => {
    const regularQuery = initialRegularQuery;
    const privateQuery = initialPrivateQuery;
    render('regular', regularQuery);
    render('private', privateQuery);
    if (!regularQuery) $('regularStatus').textContent = `Regular Course: ${state.courses.regular.students.length}টি search record প্রস্তুত।`;
    if (!privateQuery) $('privateStatus').textContent = `Private Course: ${state.courses.private.students.length}টি search record প্রস্তুত।`;
  })
  .catch(error => {
    console.error(error);
    $('regularResults').innerHTML = '<div class="empty">Regular Course-এর data লোড করা যায়নি।</div>';
    $('privateResults').innerHTML = '<div class="empty">Private Course-এর data লোড করা যায়নি।</div>';
  });
