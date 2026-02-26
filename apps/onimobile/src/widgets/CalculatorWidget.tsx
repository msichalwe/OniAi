/**
 * Calculator Widget — Basic calculator.
 */

import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { radius, fontSize } from '../theme/spacing';

const BUTTONS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['0', '.', '⌫', '='],
];

const OPS: Record<string, string> = { '÷': '/', '×': '*', '−': '-', '+': '+' };

export default function CalculatorWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState<string | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);

  const press = (btn: string) => {
    if (btn === 'C') { setDisplay('0'); setPrev(null); setOp(null); setFresh(true); return; }
    if (btn === '⌫') { setDisplay((d) => d.length > 1 ? d.slice(0, -1) : '0'); return; }
    if (btn === '±') { setDisplay((d) => d.startsWith('-') ? d.slice(1) : `-${d}`); return; }
    if (btn === '%') { setDisplay((d) => String(parseFloat(d) / 100)); return; }
    if (['÷', '×', '−', '+'].includes(btn)) {
      setPrev(display); setOp(OPS[btn]); setFresh(true); return;
    }
    if (btn === '=') {
      if (prev && op) {
        try {
          const result = Function(`"use strict"; return (${prev} ${op} ${display})`)();
          setDisplay(String(parseFloat(result.toFixed(10))));
        } catch { setDisplay('Error'); }
        setPrev(null); setOp(null); setFresh(true);
      }
      return;
    }
    // Digit or dot
    if (fresh) { setDisplay(btn === '.' ? '0.' : btn); setFresh(false); }
    else { setDisplay((d) => d === '0' && btn !== '.' ? btn : d + btn); }
  };

  const isOp = (btn: string) => ['÷', '×', '−', '+', '='].includes(btn);
  const isFunc = (btn: string) => ['C', '±', '%', '⌫'].includes(btn);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={styles.displayWrap}>
        <Text style={[styles.display, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {display}
        </Text>
      </View>
      <View style={styles.grid}>
        {BUTTONS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((btn) => (
              <TouchableOpacity
                key={btn}
                style={[
                  styles.btn,
                  isOp(btn) && { backgroundColor: c.primary },
                  isFunc(btn) && { backgroundColor: c.primaryMuted },
                  btn === '0' && { flex: 1 },
                ]}
                activeOpacity={0.7}
                onPress={() => press(btn)}
              >
                <Text style={[
                  styles.btnText,
                  isOp(btn) && { color: '#fff' },
                  isFunc(btn) && { color: c.primary },
                  !isOp(btn) && !isFunc(btn) && { color: c.text },
                ]}>
                  {btn}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const btnSize = (Dimensions.get('window').width - 80) / 4;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end', padding: 16 },
  displayWrap: { paddingHorizontal: 8, marginBottom: 24 },
  display: { fontSize: 52, fontFamily: 'Inter_400Regular', textAlign: 'right' },
  grid: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    width: btnSize,
    height: btnSize * 0.7,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  btnText: { fontSize: fontSize.xl, fontFamily: 'Inter_600SemiBold' },
});
