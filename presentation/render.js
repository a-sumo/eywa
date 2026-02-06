let currentData = presentation;

// Inline Eywa logo SVG
const eywaLogoSvg = `<svg viewBox="0 0 227 235" width="48" height="48" fill="none">
  <path d="M104 119.772C104 105.718 116.165 94.7547 130.143 96.2108L212.55 104.795C220.478 105.621 226.5 112.303 226.5 120.273C226.5 128.315 220.372 135.033 212.364 135.77L129.858 143.36C115.977 144.637 104 133.711 104 119.772Z" fill="#15D1FF"/>
  <path d="M108.76 115.522C122.535 115.249 133.285 127.346 131.399 140.996L119.891 224.298C119.094 230.065 114.162 234.362 108.341 234.362C102.442 234.362 97.4782 229.951 96.7852 224.093L86.9089 140.602C85.351 127.433 95.4996 115.784 108.76 115.522Z" fill="#2543FF"/>
  <path d="M110.125 0.766382C116.648 0.766369 122.171 5.57125 123.072 12.0312L135.586 101.719C137.482 115.311 127.072 127.515 113.35 127.786C99.8466 128.053 89.0605 116.63 90.0996 103.163L97.0672 12.8569C97.5934 6.03582 103.284 0.766395 110.125 0.766382Z" fill="#6417EC"/>
  <path d="M0 121.46C0 113.001 6.32766 105.88 14.7274 104.886L83.0607 96.7954C97.929 95.0351 111 106.65 111 121.622V123.754C111 139.082 97.3328 150.8 82.1846 148.461L14.1425 137.954C6.00503 136.697 0 129.693 0 121.46Z" fill="#E72B76"/>
  <rect width="69.0908" height="37.6259" rx="18.813" transform="matrix(-0.682103 -0.731256 0.714523 -0.699611 153.127 179.555)" fill="#15D1FF"/>
  <rect width="71.2152" height="41.6372" rx="20.8186" transform="matrix(0.798895 -0.60147 0.582827 0.812597 43 142.042)" fill="#2543FF"/>
  <rect width="69.0901" height="37.4677" rx="18.7339" transform="matrix(-0.682386 0.730992 -0.714252 -0.699889 170.38 84.1525)" fill="#6417EC"/>
  <rect width="75.2802" height="37.978" rx="18.989" transform="matrix(0.679222 0.733933 -0.717276 0.696789 83.8679 59.6776)" fill="#E72B76"/>
</svg>`;

// Small grayed corner logo
const eywaLogoCorner = `<div class="corner-logo">${eywaLogoSvg.replace('width="48" height="48"', 'width="24" height="24"')}</div>`;


function getSection(slideTitle, data) {
  for (const [section, slides] of Object.entries(data.sections)) {
    if (slides.includes(slideTitle)) return section;
  }
  return '';
}

function renderSlides(data) {
  const container = document.getElementById('slides-container');
  let html = '';

  // Title slide with summary
  html += `
    <section>
      <div class="title-logo">${eywaLogoSvg.replace('width="48" height="48"', 'width="80" height="80"')}</div>
      <h1>${data.title}</h1>
      <p>${data.subtitle}</p>
      ${data.summary ? `
        <div class="summary">
          ${data.summary.map(item => `<div class="summary-item">${item}</div>`).join('')}
        </div>
      ` : ''}
    </section>
  `;

  // Content slides
  for (const slide of data.slides) {
    const section = getSection(slide.title, data);
    html += '<section>';
    html += eywaLogoCorner;
    html += `<h2>${slide.title}</h2>`;

    if (slide.subtitle) {
      html += `<p style="color: #888; font-size: 0.8em;">${slide.subtitle}</p>`;
    }

    if (slide.type === 'bullets') {
      html += '<ul>';
      for (const item of slide.items) {
        if (item) html += `<li>${item}</li>`;
      }
      html += '</ul>';
    }

    if (slide.type === 'bigstat') {
      html += '<div class="bigstat-grid">';
      for (const s of slide.stats) {
        html += `
          <div class="bigstat-card">
            <div class="bigstat-value">${s.value}</div>
            <div class="bigstat-label">${s.label}</div>
          </div>
        `;
      }
      html += '</div>';
      if (slide.footnote) {
        html += `<p class="bigstat-footnote">${slide.footnote}</p>`;
      }
    }

    if (slide.type === 'logogrid') {
      html += '<div class="logo-grid">';
      for (const item of slide.items) {
        html += `
          <div class="logo-card">
            <div class="logo-name">${item.name}</div>
            <div class="logo-stat">${item.stat}</div>
            <div class="logo-detail">${item.detail}</div>
          </div>
        `;
      }
      html += '</div>';
    }

    if (slide.type === 'bars') {
      html += '<div class="bars-container">';
      const maxVal = Math.max(...slide.items.map(i => i.value));
      for (const item of slide.items) {
        const pct = Math.min((item.value / maxVal) * 100, 100);
        html += `
          <div class="bar-row">
            <div class="bar-label">${item.label}</div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${pct}%; background: ${item.color};" data-width="${pct}"></div>
              <span class="bar-value">${item.display}</span>
            </div>
          </div>
        `;
      }
      html += '</div>';
      if (slide.source) {
        html += `<p class="bar-source">${slide.source}</p>`;
      }
    }

    if (slide.type === 'timeline') {
      html += '<div class="timeline">';
      for (const event of slide.items) {
        html += `
          <div class="timeline-item">
            <div class="timeline-year">${event.year}</div>
            <div class="timeline-content">
              <div class="timeline-title">${event.title}</div>
              <div class="timeline-desc">${event.description}</div>
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    if (slide.type === 'image') {
      html += `<img src="${slide.src}" alt="${slide.alt || slide.title}" style="box-shadow: 0 4px 20px rgba(0,0,0,0.1); border-radius: 10px;">`;
      if (slide.caption) {
        html += `<p style="font-size: 0.6em; color: #666; margin-top: 10px;">${slide.caption}</p>`;
      }
    }

    if (slide.type === 'diagram') {
      html += `<div class="diagram">${slide.content}</div>`;
    }

    // Section indicator
    if (section) {
      html += `<div class="section-indicator">${section}</div>`;
    }

    html += '</section>';
  }

  // Closing slide
  html += `
    <section>
      <div class="title-logo">${eywaLogoSvg.replace('width="48" height="48"', 'width="80" height="80"')}</div>
      <h1>${data.closing.title}</h1>
      <p>${data.closing.subtitle}</p>
    </section>
  `;

  container.innerHTML = html;
}

function animateBars() {
  const bars = document.querySelectorAll('.bar-fill');
  bars.forEach(bar => {
    const w = bar.getAttribute('data-width');
    bar.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.width = w + '%';
      });
    });
  });
}

function initReveal() {
  Reveal.initialize({
    hash: true,
    transition: 'slide',
    transitionSpeed: 'slow',
    backgroundTransition: 'fade',
    slideNumber: 'c/t',
    width: 1280,
    height: 900,
    margin: 0.02,
    minScale: 0.1,
    maxScale: 2.0,
    center: false
  });

  Reveal.on('slidechanged', () => {
    animateBars();
  });
}

function buildChapterMenu(data) {
  const menu = document.getElementById('chapter-menu');
  let html = '<div class="chapter-item" data-slide="0">Start</div>';

  let slideIndex = 1;
  for (const [sectionName, sectionSlides] of Object.entries(data.sections)) {
    html += `<div class="chapter-item" data-slide="${slideIndex}">${sectionName}</div>`;
    slideIndex += sectionSlides.length;
  }

  menu.innerHTML = html;

  menu.querySelectorAll('.chapter-item').forEach(item => {
    item.addEventListener('click', () => {
      Reveal.slide(parseInt(item.dataset.slide));
      menu.classList.add('hidden');
    });
  });
}

function toggleChapterMenu() {
  const menu = document.getElementById('chapter-menu');
  menu.classList.toggle('hidden');
}

// Initial render
renderSlides(presentation);
initReveal();
buildChapterMenu(presentation);

// Navigation listeners
document.getElementById('nav-home').addEventListener('click', () => Reveal.slide(0));
document.getElementById('nav-menu').addEventListener('click', toggleChapterMenu);

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  const menu = document.getElementById('chapter-menu');
  const menuBtn = document.getElementById('nav-menu');
  if (!menu.contains(e.target) && e.target !== menuBtn) {
    menu.classList.add('hidden');
  }
});
