(() => {
  'use strict';

  const card = document.querySelector('#deployment-card');
  const modeButtons = [...document.querySelectorAll('[data-card-mode]')];
  const cardToggles = [...document.querySelectorAll('.card-toggle')];
  const statusPicker = document.querySelector('#status-picker');
  const statusPill = document.querySelector('#status-pill b');
  const metricStatus = document.querySelector('#metric-status');
  const metricFailure = document.querySelector('#metric-failure');
  const themeToggle = document.querySelector('#theme-toggle');
  const detailRegion = document.querySelector('#card-detail');

  const statuses = {
    running: { label: '运行中', failure: '否' },
    deploying: { label: '部署中', failure: '否' },
    stopped: { label: '已停止', failure: '否' },
    failed: { label: '部署失败', failure: '是' },
    fault: { label: '服务故障', failure: '待排查' },
  };

  function setMode(mode) {
    const detail = mode === 'detail';
    card.dataset.mode = detail ? 'detail' : 'compact';
    detailRegion.setAttribute('aria-hidden', String(!detail));
    modeButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.cardMode === card.dataset.mode));
    });
    cardToggles.forEach(button => {
      button.setAttribute('aria-expanded', String(detail));
      button.title = detail ? '收起详情' : '展开详情';
      const label = button.querySelector('span:not(.sr-only)');
      const screenReaderLabel = button.querySelector('.sr-only');
      if (label) label.textContent = detail ? '收起详情' : '展开详情';
      if (screenReaderLabel) screenReaderLabel.textContent = detail ? '收起详情' : '展开详情';
    });
  }

  function setStatus(status) {
    const view = statuses[status] || statuses.running;
    card.dataset.status = statuses[status] ? status : 'running';
    statusPill.textContent = view.label;
    metricStatus.textContent = view.label;
    metricFailure.textContent = view.failure;
  }

  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.cardMode)));
  cardToggles.forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    setMode(card.dataset.mode === 'detail' ? 'compact' : 'detail');
  }));
  statusPicker.addEventListener('change', () => setStatus(statusPicker.value));
  themeToggle.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    themeToggle.setAttribute('aria-pressed', String(dark));
  });

  setMode('compact');
  setStatus('running');
})();
