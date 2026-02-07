let currentData = presentation;

// Inline Eywa logo SVG
const eywaLogoSvg = `<svg viewBox="0 0 250 250" width="48" height="48" fill="none">
  <path d="M116 124.524C116 110.47 128.165 99.5067 142.143 100.963L224.55 109.547C232.478 110.373 238.5 117.055 238.5 125.025C238.5 133.067 232.372 139.785 224.364 140.522L141.858 148.112C127.977 149.389 116 138.463 116 124.524Z" fill="#15D1FF"/>
  <path d="M120.76 120.274C134.535 120.001 145.285 132.097 143.399 145.748L131.891 229.05C131.094 234.817 126.162 239.114 120.341 239.114C114.442 239.114 109.478 234.703 108.785 228.845L98.9089 145.354C97.351 132.184 107.5 120.536 120.76 120.274Z" fill="#2543FF"/>
  <path d="M122.125 5.51834C128.648 5.51832 134.171 10.3232 135.072 16.7832L147.586 106.471C149.482 120.063 139.072 132.267 125.35 132.538C111.847 132.805 101.061 121.382 102.1 107.915L109.067 17.6089C109.593 10.7878 115.284 5.51835 122.125 5.51834Z" fill="#823DFC"/>
  <path d="M12 126.211C12 117.753 18.3277 110.632 26.7274 109.638L95.0607 101.547C109.929 99.787 123 111.402 123 126.374V128.506C123 143.834 109.333 155.552 94.1845 153.213L26.1425 142.706C18.005 141.449 12 134.445 12 126.211Z" fill="#E72B76"/>
  <rect width="69.0908" height="37.6259" rx="18.813" transform="matrix(-0.682103 -0.731256 0.714523 -0.699611 165.127 184.307)" fill="#15D1FF"/>
  <rect width="69.0901" height="37.4677" rx="18.7339" transform="matrix(-0.682386 0.730992 -0.714252 -0.699889 182.38 88.9044)" fill="#823DFC"/>
  <rect width="75.2802" height="37.978" rx="18.989" transform="matrix(0.679222 0.733933 -0.717276 0.696789 95.8679 64.4296)" fill="#E72B76"/>
  <rect width="71.2152" height="41.6372" rx="20.8186" transform="matrix(0.798895 -0.60147 0.582827 0.812597 55 149.834)" fill="#2543FF"/>
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
