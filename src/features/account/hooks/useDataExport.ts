import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { showAlert } from '@/components/ui/Feedback';
import { formatBytes } from '@/utils/format';
import { errorMessage } from '@/utils/errors';
import { dataExportApi } from '@/features/account/api/dataExportApi';
import { countExportedRecords, exportFileName } from '@/features/account/dataExport';

type ExportResult = { fileSize: string; recordCount: number };

/**
 * Downloads the person's data as a JSON file and opens the share sheet for it. The result is
 * cleared when the screen is left, so coming back starts fresh.
 */
export function useDataExport() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  useFocusEffect(useCallback(() => () => setResult(null), []));

  async function exportData() {
    setExporting(true);
    try {
      const data = await dataExportApi.exportMine();
      const json = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, exportFileName());
      file.write(json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export My Data',
          UTI: 'public.json',
        });
      } else {
        showAlert('Saved', `Data exported to:\n${file.uri}`);
      }
      setResult({
        fileSize: formatBytes(file.size ?? json.length),
        recordCount: countExportedRecords(data),
      });
    } catch (err) {
      setResult(null);
      showAlert('Export Failed', errorMessage(err, 'An unexpected error occurred'));
    } finally {
      setExporting(false);
    }
  }

  return { exporting, result, exportData };
}
