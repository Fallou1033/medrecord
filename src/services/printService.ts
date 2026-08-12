import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Executes web print in an isolated hidden iframe (Desktop) or popup window (Mobile Web).
 * Guarantees zero web navbar/form leakage in print preview.
 */
export function executeWebIframePrint(htmlContent: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (Platform.OS !== 'web') {
      resolve();
      return;
    }
    try {
      const isMobile = typeof navigator !== 'undefined' && (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
        window.innerWidth < 768
      );

      if (isMobile) {
        const printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.open();
          printWin.document.write(htmlContent);
          printWin.document.close();
          printWin.focus();
          setTimeout(() => {
            printWin.print();
            resolve();
          }, 500);
          return;
        }
      }

      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(htmlContent);
        frameDoc.close();

        setTimeout(() => {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(printFrame)) {
              document.body.removeChild(printFrame);
            }
            resolve();
          }, 1000);
        }, 400);
      } else {
        resolve();
      }
    } catch (e) {
      console.error('Web iframe print error:', e);
      resolve();
    }
  });
}

/**
 * Native mobile print or share helper.
 */
export async function printOrShareDocumentNative(htmlContent: string, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    await executeWebIframePrint(htmlContent);
  } else {
    try {
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: title,
        UTI: 'com.adobe.pdf',
      });
    } catch (err) {
      console.error('Native print/share error:', err);
      await Print.printAsync({ html: htmlContent });
    }
  }
}
