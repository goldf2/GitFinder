(function exposeDirectoryPreviews(root) {
  const SAFE_IMAGE = /^data:image\/png;base64,[a-z0-9+/=\r\n]+$/i;
  class Loader {
    constructor(getPreview) {
      this.getPreview = getPreview;
      this.generation = 0;
      this.active = 0;
      this.queue = [];
      this.observer = null;
    }
    disconnect() {
      this.generation += 1;
      this.observer?.disconnect();
      this.observer = null;
      this.queue = [];
    }
    observe(elements, showHidden) {
      const targets = elements.filter(element => element.querySelector('[data-directory-preview]'));
      if (!targets.length) return;
      const generation = this.generation;
      const enqueue = element => {
        this.queue.push({ element, showHidden, generation });
        this.pump();
      };
      const view = targets[0].ownerDocument.defaultView;
      if (view.IntersectionObserver) {
        this.observer ||= new view.IntersectionObserver(entries => {
          entries.filter(entry => entry.isIntersecting).forEach(entry => {
            this.observer.unobserve(entry.target);
            enqueue(entry.target);
          });
        }, { rootMargin: '150px' });
        targets.forEach(element => this.observer.observe(element));
      } else targets.forEach(enqueue);
    }
    pump() {
      while (this.active < 4 && this.queue.length) {
        const job = this.queue.shift();
        this.active += 1;
        Promise.resolve().then(async () => {
          if (!this.current(job)) return;
          const preview = await this.getPreview(job.element.dataset.path, job.showHidden);
          if (!this.current(job)) return;
          const target = job.element.querySelector('[data-directory-preview]');
          const doc = job.element.ownerDocument;
          target.replaceChildren();
          const images = doc.createElement('div');
          images.className = 'directory-preview-images';
          (preview.thumbnails || []).filter(image => SAFE_IMAGE.test(String(image.dataUrl || ''))).slice(0, 4).forEach(image => {
            const img = doc.createElement('img');
            img.src = image.dataUrl;
            img.alt = image.name;
            img.title = image.name;
            images.append(img);
          });
          if (images.children.length) {
            const galleryVisual = job.element.querySelector('.finder-gallery-item-visual');
            if (galleryVisual) galleryVisual.replaceChildren(images);
            else target.append(images);
          } else if (!job.element.classList.contains('finder-gallery-item')) {
            const samples = doc.createElement('div');
            samples.className = 'directory-preview-samples';
            samples.textContent = (preview.samples || []).slice(0, 3).map(item => `${item.type === 'directory' ? '📁' : '📄'} ${item.name}`).join(' · ') || '空文件夹';
            target.append(samples);
          }
          const counts = doc.createElement('small');
          counts.textContent = `${preview.fileCount} 个文件 · ${preview.directoryCount} 个文件夹${preview.symlinkCount ? ` · ${preview.symlinkCount} 个链接` : ''}`;
          counts.title = job.showHidden ? '本层内容，包含隐藏项目' : '本层内容，不含隐藏项目';
          target.append(counts);
          target.dataset.previewState = 'ready';
        }).catch(() => {
          if (this.current(job)) {
            const target = job.element.querySelector('[data-directory-preview]');
            target.textContent = '无法读取本层内容';
            target.dataset.previewState = 'unavailable';
          }
        }).finally(() => { this.active -= 1; this.pump(); });
      }
    }
    current(job) { return job.generation === this.generation && job.element.isConnected; }
  }
  root.DirectoryPreviews = { Loader };
})(typeof window !== 'undefined' ? window : globalThis);
