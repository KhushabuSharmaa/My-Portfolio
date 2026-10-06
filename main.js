import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.1.20/+esm';

const TOTAL_FRAMES = 90;
const FRAME_PATH = (index) => `./frames/ezgif-frame-${String(index).padStart(3, '0')}.jpg`;


// Touch / Device Detection
const isTouchDevice = () => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
};

// DOM Elements
const canvas = document.getElementById('animation-canvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const loader = document.getElementById('loader');
const loaderPercent = document.getElementById('loader-percent');
const loaderBar = document.getElementById('loader-bar');
const siteHeader = document.querySelector('.site-header');
const scrollProgressBar = document.getElementById('scroll-progress-bar');

// Mobile Menu Elements
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

// Floating Connect Speed-Dial Hub
const floatingConnectHub = document.getElementById('floating-connect-hub');
const floatingConnectBtn = document.getElementById('floating-connect-btn');

// Modal Elements
const certModal = document.getElementById('cert-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalDownload = document.getElementById('modal-download');
const modalClose = document.getElementById('modal-close');
const modalBackdrop = document.querySelector('.modal-backdrop');
const legalPdfLink = document.getElementById('legal-pdf-link');

// Form Elements
const contactForm = document.getElementById('contact-form');
const submitBtn = document.getElementById('submit-btn');
const formFeedback = document.getElementById('form-feedback');

// State
const images = new Array(TOTAL_FRAMES + 1);
let loadedCount = 0;
let currentFrame = 1;
let targetFrame = 1;
let lastDrawnFrame = -1;
let isFirstFrameReady = false;
let isLoaderHidden = false;
let needsForcedRedraw = false;
let lastRenderTime = 0;
let isMobileMenuOpen = false;

// 1. Initialize Smooth Scroll with Lenis (Optimized for Android, Tablets & 120Hz/60Hz Displays)
let lenis;
let targetProgress = 0;

try {
  const isTouch = isTouchDevice();
  if (typeof Lenis === 'function') {
    lenis = new Lenis({
      duration: isTouch ? 0.45 : 0.75,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.0,
      syncTouch: false,
      autoRaf: false,
    });

    lenis.on('scroll', (e) => {
      if (typeof e.progress === 'number' && !isNaN(e.progress)) {
        targetProgress = Math.max(0, Math.min(1, e.progress));
      }
    });
  } else {
    throw new Error('Lenis class unavailable');
  }
} catch (err) {
  console.warn('Lenis fallback active:', err);
  lenis = {
    raf: () => { },
    scrollTo: (target) => {
      target?.scrollIntoView({ behavior: 'smooth' });
    },
    resize: () => { },
    progress: 0,
  };
}

// Mobile Menu Open/Close Controls
function toggleMobileMenu(forceState) {
  const nextState = typeof forceState === 'boolean' ? forceState : !isMobileMenuOpen;
  isMobileMenuOpen = nextState;

  if (mobileMenuToggle) {
    mobileMenuToggle.classList.toggle('active', isMobileMenuOpen);
    mobileMenuToggle.setAttribute('aria-expanded', String(isMobileMenuOpen));
  }

  if (mobileNavDrawer) {
    mobileNavDrawer.classList.toggle('active', isMobileMenuOpen);
    mobileNavDrawer.setAttribute('aria-hidden', String(!isMobileMenuOpen));
  }

  if (isMobileMenuOpen) {
    document.body.classList.add('mobile-menu-open');
    if (lenis && typeof lenis.stop === 'function') lenis.stop();
  } else {
    document.body.classList.remove('mobile-menu-open');
    if (lenis && typeof lenis.start === 'function') lenis.start();
  }
}

mobileMenuToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMobileMenu();
});

// Close mobile menu when clicking any nav link
mobileNavLinks.forEach((link) => {
  link.addEventListener('click', () => {
    toggleMobileMenu(false);
  });
});

// Close mobile menu on outside click or escape
document.addEventListener('click', (e) => {
  if (isMobileMenuOpen && mobileNavDrawer && !mobileNavDrawer.contains(e.target) && !mobileMenuToggle?.contains(e.target)) {
    toggleMobileMenu(false);
  }
});

// Smooth anchor scrolling for all internal hash links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href === '#' || !href) return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      toggleMobileMenu(false);

      const headerOffset = window.innerWidth <= 768 ? 70 : 80;
      if (lenis && typeof lenis.scrollTo === 'function') {
        lenis.scrollTo(target, { offset: -headerOffset, duration: 0.85 });
      } else {
        const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  });
});

// 2. Resize Canvas Handling (Clamped DPR for Optimal Fillrate on Mobile GPUs)
function resizeCanvas() {
  const isMobile = window.innerWidth <= 768;
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
  const displayWidth = window.innerWidth;
  const displayHeight = window.innerHeight;

  const targetWidth = Math.round(displayWidth * dpr);
  const targetHeight = Math.round(displayHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = isMobile ? 'low' : 'medium';
    needsForcedRedraw = true;
  }
}

// 3. Aspect Ratio Cover Drawing with Pixel Rounding for Max Performance
function drawFrame(img) {
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const cWidth = canvas.width;
  const cHeight = canvas.height;
  const iWidth = img.naturalWidth;
  const iHeight = img.naturalHeight;

  const scale = Math.min(cWidth / iWidth, cHeight / iHeight);
  const renderWidth = iWidth * scale;
  const renderHeight = iHeight * scale;
  const offsetX = (cWidth - renderWidth) / 2;
  const offsetY = (cHeight - renderHeight) / 2;

  ctx.clearRect(0, 0, cWidth, cHeight);
  ctx.drawImage(
    img,
    Math.round(offsetX),
    Math.round(offsetY),
    Math.round(renderWidth),
    Math.round(renderHeight)
  );
}

// 4. Fallback for Nearest Loaded Frame
function getRenderableFrame(index) {
  if (images[index] && images[index].isReady) {
    return images[index];
  }

  for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
    const prev = index - offset;
    if (prev >= 1 && images[prev] && images[prev].isReady) {
      return images[prev];
    }
    const next = index + offset;
    if (next <= TOTAL_FRAMES && images[next] && images[next].isReady) {
      return images[next];
    }
  }
  return null;
}

// 5. Load Single Frame with Async Decoding
async function loadSingleFrame(index) {
  if (images[index] && images[index].isReady) return images[index];

  return new Promise((resolve) => {
    const img = new Image();
    img.src = FRAME_PATH(index);

    const onReady = async () => {
      try {
        if ('decode' in img) {
          await img.decode();
        }
      } catch {
        // Safe decode fallback
      }
      img.isReady = true;
      images[index] = img;
      loadedCount++;
      updateLoaderProgress();
      resolve(img);
    };

    img.onload = onReady;
    img.onerror = () => {
      loadedCount++;
      updateLoaderProgress();
      resolve(null);
    };
  });
}

// 6. Update Loader UI
function hideLoader() {
  if (!isLoaderHidden && loader) {
    loader.classList.add('loaded');
    isLoaderHidden = true;
  }
}

function updateLoaderProgress() {
  const percent = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
  if (loaderPercent) loaderPercent.textContent = `${percent}%`;
  if (loaderBar) loaderBar.style.width = `${percent}%`;

  // Hide loader immediately once the first frame is ready
  if (loadedCount >= 1) {
    hideLoader();
  }
}

// Global safety timeout to ensure loader never hangs
setTimeout(hideLoader, 800);

// 7. Progressive Concurrent Batch Preloading (Prioritized Keyframe Loading)
async function preloadFrames() {
  // Step 1: Immediately fetch and render Frame 1
  const firstFrame = await loadSingleFrame(1);
  if (firstFrame) {
    isFirstFrameReady = true;
    resizeCanvas();
    drawFrame(firstFrame);
  }

  // Step 2: Load initial 18 sequential frames and keyframe stepping (every 6th frame) for responsive scrub
  const priorityQueue = [];
  for (let i = 2; i <= 18; i++) {
    priorityQueue.push(i);
  }
  for (let i = 24; i <= TOTAL_FRAMES; i += 6) {
    if (!priorityQueue.includes(i)) priorityQueue.push(i);
  }

  const isMobile = isTouchDevice() || window.innerWidth <= 768;
  const initialConcurrency = isMobile ? 6 : 10;

  const priorityWorkers = Array.from({ length: initialConcurrency }, async () => {
    while (priorityQueue.length > 0) {
      const frameIndex = priorityQueue.shift();
      if (frameIndex !== undefined && !images[frameIndex]?.isReady) {
        await loadSingleFrame(frameIndex);
      }
    }
  });

  await Promise.all(priorityWorkers);
  hideLoader();

  // Step 3: Load remaining frames in background with controlled concurrency
  const remainingQueue = [];
  for (let i = 2; i <= TOTAL_FRAMES; i++) {
    if (!images[i]?.isReady) {
      remainingQueue.push(i);
    }
  }

  const backgroundConcurrency = isMobile ? 3 : 6;
  const bgWorkers = Array.from({ length: backgroundConcurrency }, async () => {
    while (remainingQueue.length > 0) {
      const frameIndex = remainingQueue.shift();
      if (frameIndex !== undefined) {
        await loadSingleFrame(frameIndex);
        // Small yield to keep UI frame thread unblocked
        await new Promise((r) => setTimeout(r, 8));
      }
    }
  });

  await Promise.all(bgWorkers);
}

// 8. Animation & Render Loop with Direct Delta-Time Damping (Zero Lag, Silky 120Hz/60Hz)
function render(time) {
  if (lenis && typeof lenis.raf === 'function') {
    lenis.raf(time);
  }

  // Header glass state toggle on scroll
  const scrollY = window.scrollY || window.pageYOffset || 0;
  if (scrollY > 30) {
    siteHeader?.classList.add('scrolled');
  } else {
    siteHeader?.classList.remove('scrolled');
  }

  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  let progress = targetProgress;
  if (lenis && typeof lenis.progress === 'number' && !isNaN(lenis.progress) && lenis.progress >= 0) {
    progress = Math.max(0, Math.min(1, lenis.progress));
  } else {
    progress = Math.max(0, Math.min(1, scrollY / maxScroll));
  }

  // Top scroll progress bar
  if (scrollProgressBar) {
    scrollProgressBar.style.width = `${progress * 100}%`;
  }

  targetFrame = 1 + progress * (TOTAL_FRAMES - 1);

  // Time-delta normalized exponential damping tuned for instantaneous tracking without lag
  const dt = lastRenderTime ? Math.min((time - lastRenderTime) / 1000, 0.05) : 0.016;
  lastRenderTime = time;

  const damping = 1 - Math.exp(-28 * dt);
  currentFrame += (targetFrame - currentFrame) * damping;

  // Snap to target if within micro-threshold to eliminate redundant repaints
  if (Math.abs(targetFrame - currentFrame) < 0.02) {
    currentFrame = targetFrame;
  }

  const clampedFrame = Math.max(1, Math.min(TOTAL_FRAMES, currentFrame));
  const roundedFrame = Math.round(clampedFrame);

  if (roundedFrame !== lastDrawnFrame || needsForcedRedraw) {
    const frameImg = getRenderableFrame(roundedFrame);
    if (frameImg) {
      drawFrame(frameImg);
      lastDrawnFrame = roundedFrame;
      needsForcedRedraw = false;
    }
  }

  requestAnimationFrame(render);
}

// 9. Floating Speed-Dial Connect Hub Toggle
floatingConnectBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  floatingConnectHub?.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (floatingConnectHub?.classList.contains('active') && !floatingConnectHub.contains(e.target)) {
    floatingConnectHub.classList.remove('active');
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    floatingConnectHub?.classList.remove('active');
    toggleMobileMenu(false);
    closeModal();
  }
});

// 10. Certificate Filter Tabs & Show More Expansion
const certFilterBtns = document.querySelectorAll('.cert-filter-btn');
const certCards = document.querySelectorAll('.cert-card');
const certsSection = document.getElementById('certificates');
const toggleCertsBtn = document.getElementById('toggle-certs-btn');
const toggleCertsText = document.getElementById('toggle-certs-text');
const certExpandWrap = document.querySelector('.cert-expand-wrap');
let isCertsExpanded = false;

toggleCertsBtn?.addEventListener('click', () => {
  isCertsExpanded = !isCertsExpanded;
  certsSection?.classList.toggle('expanded', isCertsExpanded);
  if (toggleCertsText) {
    toggleCertsText.textContent = isCertsExpanded ? 'VIEW LESS' : 'VIEW MORE (17+)';
  }
  if (lenis && typeof lenis.resize === 'function') {
    lenis.resize();
  }
});

certFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    certFilterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Scroll active chip into view horizontally on mobile
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

    const filter = btn.getAttribute('data-filter');

    if (filter === 'all') {
      if (certExpandWrap) certExpandWrap.style.display = 'flex';
      certCards.forEach((card) => {
        card.classList.remove('hidden');
      });
    } else {
      if (certExpandWrap) certExpandWrap.style.display = 'none';
      certCards.forEach((card) => {
        const categories = card.getAttribute('data-category') || '';
        if (categories.includes(filter)) {
          card.classList.remove('hidden');
          card.style.display = 'flex';
        } else {
          card.classList.add('hidden');
          card.style.display = 'none';
        }
      });
    }

    if (lenis && typeof lenis.resize === 'function') {
      lenis.resize();
    }
  });
});

// 11. Modal Handlers for Certificates & Legal Terms (Mobile & Tablet Optimized)
function openModal(src, title, type, previewSrc) {
  if (!certModal) return;
  modalTitle.textContent = title || 'Document';
  if (modalDownload) {
    modalDownload.href = src;
    modalDownload.setAttribute('download', title || 'document');
  }
  modalBody.innerHTML = '';

  const isMobile = window.innerWidth <= 768;

  if (type === 'image') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = title || 'Certificate Preview';
    img.loading = 'eager';
    modalBody.appendChild(img);
  } else if (type === 'pdf') {
    // On Android/mobile browsers, native iframe PDF embedding can be unsupported or cramped.
    // Provide a rich responsive image preview with a direct 1-tap view action.
    if (isMobile && previewSrc) {
      const wrap = document.createElement('div');
      wrap.className = 'modal-mobile-pdf-wrap';

      const img = document.createElement('img');
      img.src = previewSrc;
      img.alt = title || 'Certificate Document Preview';
      img.className = 'modal-mobile-preview-img';

      const actionBtn = document.createElement('a');
      actionBtn.href = src;
      actionBtn.target = '_blank';
      actionBtn.rel = 'noopener';
      actionBtn.className = 'btn-pill modal-mobile-pdf-btn';
      actionBtn.innerHTML = `<span>VIEW FULL DOCUMENT (PDF)</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>`;

      wrap.appendChild(img);
      wrap.appendChild(actionBtn);
      modalBody.appendChild(wrap);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title || 'Document Viewer';
      modalBody.appendChild(iframe);
    }
  }

  certModal.classList.add('active');
  certModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (lenis && typeof lenis.stop === 'function') lenis.stop();
}

function closeModal() {
  if (!certModal) return;
  certModal.classList.remove('active');
  certModal.setAttribute('aria-hidden', 'true');
  modalBody.innerHTML = '';
  document.body.style.overflow = '';
  if (lenis && typeof lenis.start === 'function') lenis.start();
}

document.querySelectorAll('.cert-card').forEach((card) => {
  card.addEventListener('click', () => {
    const src = card.getAttribute('data-src');
    const title = card.getAttribute('data-title');
    const type = card.getAttribute('data-type') || 'pdf';
    const thumbImg = card.querySelector('.cert-thumb-img');
    const previewSrc = thumbImg ? thumbImg.src : null;
    if (src) {
      openModal(src, title, type, previewSrc);
    }
  });
});

// Legal Notice PDF Modal Trigger
legalPdfLink?.addEventListener('click', (e) => {
  e.preventDefault();
  openModal('./legal-notice.pdf', 'Intellectual Property, Copyright & Legal Terms Notice — Khushabu Sharma', 'pdf', './portfolio_thumbnail.png');
});

modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);

// 12. Contact Form Interactive Submission
contactForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const originalHtml = submitBtn.innerHTML;
  submitBtn.innerHTML = `<span>SENDING...</span>`;
  submitBtn.disabled = true;

  setTimeout(() => {
    submitBtn.innerHTML = originalHtml;
    submitBtn.disabled = false;
    formFeedback.textContent = '✓ Thank you! Your message has been sent to Khushabu Sharma.';
    formFeedback.className = 'form-feedback success';
    contactForm.reset();

    setTimeout(() => {
      formFeedback.className = 'form-feedback';
    }, 5000);
  }, 900);
});

// 13. Dynamic Viewport, Orientation & Resize Handlers
let resizeDebounceTimer;
function handleResize() {
  clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    resizeCanvas();
    if (lenis && typeof lenis.resize === 'function') {
      lenis.resize();
    }
  }, 100);
}

window.addEventListener('resize', handleResize, { passive: true });
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    resizeCanvas();
    if (lenis && typeof lenis.resize === 'function') {
      lenis.resize();
    }
  }, 150);
});

window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  preloadFrames();
  requestAnimationFrame(render);
});


async function initTechStackBalls() {
  const container = document.getElementById("techstack-canvas");
  if (!container) return;
  try {
    const THREE = await import("https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js");
    const RAPIER = await import("https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat/rapier.es.js");
    await RAPIER.init();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, .1, 100);
    camera.position.set(0, 0, 18);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
    keyLight.position.set(4, 8, 12);
    scene.add(keyLight);
    const pinkLight = new THREE.PointLight(0xffd8ee, 18, 15);
    pinkLight.position.set(-5, 5, 7);
    scene.add(pinkLight);
    const lavenderLight = new THREE.PointLight(0xdccaff, 16, 14);
    lavenderLight.position.set(5, -4, 6);
    scene.add(lavenderLight);
    const blueLight = new THREE.PointLight(0xccecff, 12, 12);
    blueLight.position.set(0, -5, 8);
    scene.add(blueLight);
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    const skills = [
      ["HTML", "#ffd9cc", "#e89b80"],
      ["CSS", "#d9ecff", "#78aeda"],
      ["JAVASCRIPT", "#fff3bd", "#d6b82f"],
      ["REACT", "#d8f7ff", "#6fc8dc"],
      ["PHP", "#e3e4ff", "#9295c9"],
      ["LARAVEL", "#ffdfe2", "#e9959b"],
      ["MYSQL", "#d8f3f6", "#69aeb8"],
      ["BOOTSTRAP", "#eadfff", "#a98bd0"],
      ["GIT", "#ffe2d9", "#e9a18b"],
      ["GITHUB", "#e6ddff", "#a78bc9"],
      ["REST API", "#e6ddff", "#a68bd8"],
      ["AJAX", "#dceaff", "#7da7dc"],
      ["NODE.JS", "#def3df", "#82bd86"],
      ["TYPESCRIPT", "#dceaff", "#7fa8d8"],
      ["RESPONSIVE", "#d9f4ef", "#74bcae"],
      ["VS CODE", "#dcefff", "#76add3"]
    ];
    function createTexture(name, bg, textColor) {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 1024, 1024);
      const gradient = ctx.createRadialGradient(360, 300, 50, 512, 512, 520);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(.55, bg);
      gradient.addColorStop(1, bg);
      ctx.fillStyle = gradient;
      ctx.globalAlpha = .9;
      ctx.beginPath();
      ctx.arc(512, 512, 410, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = textColor;
      let size = 120;
      if (name.length > 8) size = 86;
      if (name.length > 11) size = 68;
      ctx.font = `700 ${size}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, 512, 512);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }
    const geometry = new THREE.SphereGeometry(1, 48, 48);
    const balls = [];
    for (let i = 0; i < 30; i++) {
      const skill = skills[i % skills.length];
      const scale = [.7, 1, .8, 1, 1][Math.floor(Math.random() * 5)];
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: createTexture(skill[0], skill[1], skill[2]),
        roughness: .14,
        metalness: .02,
        clearcoat: 1,
        clearcoatRoughness: .05,
        reflectivity: .95
      });
      const mesh = new THREE.Mesh(geometry, material);
      const angle = i * .55;
      const radius = 1 + Math.random() * 2.1;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * .6;
      const z = (Math.random() - .5) * 1.5;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      scene.add(mesh);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setLinearDamping(.62)
          .setAngularDamping(.12)
          .setGravityScale(0)
      );
      world.createCollider(
        RAPIER.ColliderDesc.ball(scale)
          .setRestitution(.68)
          .setFriction(.18),
        body
      );
      balls.push({ mesh, body, scale });
    }
    const pointerBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(100, 100, 100)
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(2)
        .setRestitution(1)
        .setFriction(0),
      pointerBody
    );
    const cursorGroup = new THREE.Group();
    scene.add(cursorGroup);
    const cursorOuter = new THREE.Mesh(
      new THREE.RingGeometry(.18, .22, 48),
      new THREE.MeshBasicMaterial({
        color: 0xc7a7ff,
        transparent: true,
        opacity: .65,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    cursorGroup.add(cursorOuter);
    const cursorInner = new THREE.Mesh(
      new THREE.CircleGeometry(.16, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf1e9ff,
        transparent: true,
        opacity: .18,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    cursorGroup.add(cursorInner);
    const cursorGlow = new THREE.Mesh(
      new THREE.RingGeometry(.25, .29, 48),
      new THREE.MeshBasicMaterial({
        color: 0xd8c2ff,
        transparent: true,
        opacity: .12,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    cursorGroup.add(cursorGlow);
    cursorGroup.position.set(100, 100, 3);
    const mouse = { active: false };
    const current = new THREE.Vector3(100, 100, 3);
    const target = new THREE.Vector3(100, 100, 3);
    function updateMouse(e) {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const height = 2 * Math.tan(THREE.MathUtils.degToRad(35) / 2) * camera.position.z;
      const width = height * camera.aspect;
      target.set((nx - .5) * width, -(ny - .5) * height, 3);
      mouse.active = true;
    }
    container.addEventListener("pointermove", updateMouse);
    container.addEventListener("pointerenter", updateMouse);
    container.addEventListener("pointerleave", () => mouse.active = false);
    container.addEventListener("touchmove", e => {
      if (e.touches[0]) updateMouse(e.touches[0]);
    }, { passive: true });
    function resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", resize);
    resize();
    let lastTime = performance.now();
    function animate() {
      requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, .033);
      lastTime = now;
      if (mouse.active) {
        current.lerp(target, .2);
        cursorGroup.visible = true;
        pointerBody.setNextKinematicTranslation({
          x: current.x,
          y: current.y,
          z: 2
        });
      } else {
        cursorGroup.visible = false;
        pointerBody.setNextKinematicTranslation({
          x: 100,
          y: 100,
          z: 100
        });
      }
      cursorGroup.position.set(current.x, current.y, 3);
      const pulse = 1 + Math.sin(now * .004) * .05;
      cursorOuter.scale.set(pulse, pulse, 1);
      cursorGlow.scale.set(pulse, pulse, 1);
      for (const ball of balls) {
        const p = ball.body.translation();
        const distance = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
        if (distance > .03) {
          const force = 12 * delta * ball.scale;
          ball.body.applyImpulse({
            x: -p.x / distance * force,
            y: -p.y / distance * force,
            z: -p.z / distance * force
          }, true);
        }
      }
      world.step();
      for (const ball of balls) {
        const p = ball.body.translation();
        const q = ball.body.rotation();
        ball.mesh.position.set(p.x, p.y, p.z);
        ball.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
      renderer.render(scene, camera);
    }
    animate();
  } catch (error) {
    console.error("Tech Stack Error:", error);
  }
}
window.addEventListener("DOMContentLoaded", () => {
  initTechStackBalls();
});