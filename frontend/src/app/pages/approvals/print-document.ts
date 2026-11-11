export function printApprovalDocument(win: Window): void {
  let printed = false;
  const print = () => {
    if (printed || win.closed) return;
    printed = true;
    win.focus();
    win.print();
  };
  const imagesReady = Promise.all(Array.from(win.document.images, image =>
    image.decode().catch(error => {
      console.error('Could not decode approval print image', image.src, error);
    }),
  ));
  const fontsReady = win.document.fonts?.ready.catch(error => {
    console.error('Could not load approval print fonts', error);
  }) ?? Promise.resolve();

  Promise.all([imagesReady, fontsReady]).then(() => win.setTimeout(print, 100));
  win.setTimeout(print, 2500);
}
