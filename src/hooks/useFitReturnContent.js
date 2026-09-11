import { useLayoutEffect } from 'react';

const CONTENT_SCALE_PROPERTY = '--return-content-scale';

const useFitReturnContent = ({ containerRef, contentRef, enabled = true, minScale = 0.72, dependencies = [] }) => {
  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    if (!container || !content) return undefined;

    let frameId;

    const fit = () => {
      const setScale = (scale) => content.style.setProperty(CONTENT_SCALE_PROPERTY, String(scale));
      setScale(1);

      if (!enabled || !container.clientHeight || !container.clientWidth) return;

      const styles = window.getComputedStyle(container);
      const availableHeight = container.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
      const availableWidth = container.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
      if (!availableHeight || !availableWidth || !content.scrollHeight || !content.scrollWidth) return;

      const fits = () => (
        content.scrollWidth <= availableWidth + 1
        && content.scrollHeight <= availableHeight + 1
      );

      if (fits()) return;

      setScale(minScale);
      if (!fits()) return;

      let low = minScale;
      let high = 1;
      let best = minScale;

      // Mirrors AutoFitText: choose the largest readable size that fits this exact composition.
      for (let step = 0; step < 10; step += 1) {
        const mid = (low + high) / 2;
        setScale(mid);

        if (fits()) {
          best = mid;
          low = mid;
        } else {
          high = mid;
        }
      }

      setScale(best);
    };

    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fit);
    };

    scheduleFit();
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(container);
    window.addEventListener('orientationchange', scheduleFit);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('orientationchange', scheduleFit);
    };
  }, [containerRef, contentRef, enabled, minScale, ...dependencies]);
};

export default useFitReturnContent;
