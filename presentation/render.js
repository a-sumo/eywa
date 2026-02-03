let currentData = presentation;

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
