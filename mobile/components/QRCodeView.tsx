import { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';
import { colors, radius } from '../theme';

interface Props {
  value: string;
  /** Total rendered size in px, including the white quiet-zone border. */
  size?: number;
}

/**
 * A QR code rendered as a plain grid of Views — no react-native-svg, no
 * canvas, no native dependency at all. qrcode-generator is pure JS: it
 * only computes WHICH cells are dark, via isDark(row, col); how to draw
 * that is entirely up to the caller, so a grid of Views is a legitimate,
 * fully-supported way to render it, not a workaround.
 *
 * True black-on-white, not the app's ink/cream tokens — a real scanner
 * needs strong contrast, and this is the one place in the app where
 * "on-brand" should lose to "actually scans reliably".
 */
export function QRCodeView({ value, size = 200 }: Props) {
  const qr = useMemo(() => {
    const q = qrcode(0, 'M'); // 0 = auto type number for the given data length
    q.addData(value);
    q.make();
    return q;
  }, [value]);

  const count = qr.getModuleCount();
  const cell = size / count;

  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FFFFFF',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.rule,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: count }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: count }).map((_, col) => (
            <View
              key={col}
              style={{
                width: cell,
                height: cell,
                backgroundColor: qr.isDark(row, col) ? '#000000' : '#FFFFFF',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
