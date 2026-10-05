import { View, Text, StyleSheet, TouchableOpacity, Modal, Linking, ActivityIndicator } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing } from '../constants/theme';
import { sabpaisaFormHtml, type SabpaisaOrder } from '../lib/payments';

// Sabpaisa's hosted checkout, inside the app.
//
// Sabpaisa takes a POSTed form (encData + clientCode), so the page is started
// from a tiny auto-submitting form (lib/payments.ts sabpaisaFormHtml). Two
// things need handling that a plain browser does for free:
//
//   * UPI. Sabpaisa's page opens UPI apps with upi:// or intent:// links. A
//     WebView cannot follow those, so they are handed to Android, which opens
//     GPay / PhonePe / Paytm.
//   * The end. Sabpaisa finishes by posting the result to our callback URL on
//     the server. When the WebView reaches it, the checkout is over -- the
//     server has the result -- and the caller asks the server for the status.

const APP_SCHEMES = /^(upi|intent|tez|phonepe|paytmmp|gpay|credpay|bhim):/i;

/** intent://pay?...#Intent;scheme=upi;package=...;end  ->  upi://pay?... */
function intentToUri(url: string): string | null {
  const m = url.match(/^intent:\/\/(.*?)#Intent;(.*)end$/i);
  if (!m) return null;
  const scheme = m[2].match(/(?:^|;)scheme=([^;]+)/i)?.[1];
  return scheme ? `${scheme}://${m[1]}` : null;
}

export function SabpaisaCheckout({
  order,
  onDone,
}: {
  order: SabpaisaOrder | null;
  /** 'returned' once Sabpaisa has posted its result; 'closed' if the person backed out. */
  onDone: (how: 'returned' | 'closed') => void;
}) {
  const insets = useSafeAreaInsets();
  if (!order) return null;

  const openExternal = async (url: string) => {
    const target = url.toLowerCase().startsWith('intent:') ? intentToUri(url) ?? url : url;
    try {
      await Linking.openURL(target);
    } catch {
      // No app handles it (e.g. that UPI app is not installed). Sabpaisa's
      // page stays open, so the person can pick another way to pay.
    }
  };

  const onShouldStart = (req: { url: string }) => {
    if (APP_SCHEMES.test(req.url)) {
      openExternal(req.url);
      return false;
    }
    return true;
  };

  const onNav = (nav: WebViewNavigation) => {
    if (!nav.loading && nav.url.startsWith(order.callbackUrl)) onDone('returned');
  };

  return (
    <Modal visible animationType="slide" onRequestClose={() => onDone('closed')}>
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Sabpaisa</Text>
          <TouchableOpacity onPress={() => onDone('closed')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.close}>Close</Text>
          </TouchableOpacity>
        </View>
        <WebView
          originWhitelist={['*']}
          source={{ html: sabpaisaFormHtml(order) }}
          onShouldStartLoadWithRequest={onShouldStart}
          onNavigationStateChange={onNav}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}><ActivityIndicator color={Colors.brandBlue} /></View>
          )}
          style={{ flex: 1, backgroundColor: Colors.bg }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  title: { color: Colors.text, fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  close: { color: Colors.brandBlue, fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
});
