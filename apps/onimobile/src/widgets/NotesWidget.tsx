/**
 * Notes Widget — Create and edit markdown notes.
 */

import { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Plus, FileText } from 'lucide-react-native';
import useThemeStore from '../stores/themeStore';
import { getColors } from '../theme/colors';
import { spacing, radius, fontSize } from '../theme/spacing';

interface Note {
  id: string;
  title: string;
  content: string;
  updated: number;
}

export default function NotesWidget() {
  const scheme = useThemeStore((s) => s.scheme);
  const c = getColors(scheme);
  const [notes, setNotes] = useState<Note[]>([
    { id: '1', title: 'Welcome to OniOS', content: 'Your AI-powered notes app.\nCreate, edit, and organize.', updated: Date.now() },
  ]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [editContent, setEditContent] = useState('');

  const createNote = () => {
    const note: Note = { id: String(Date.now()), title: 'Untitled', content: '', updated: Date.now() };
    setNotes((prev) => [note, ...prev]);
    setActiveNote(note);
    setEditContent('');
  };

  const openNote = (note: Note) => {
    setActiveNote(note);
    setEditContent(note.content);
  };

  const saveNote = () => {
    if (!activeNote) return;
    const firstLine = editContent.split('\n')[0].trim() || 'Untitled';
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeNote.id ? { ...n, title: firstLine, content: editContent, updated: Date.now() } : n,
      ),
    );
  };

  if (activeNote) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <View style={[styles.editorHeader, { borderBottomColor: c.border }]}>
          <TouchableOpacity onPress={() => { saveNote(); setActiveNote(null); }}>
            <Text style={[styles.backLink, { color: c.primary }]}>Done</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.editor, { color: c.text }]}
          value={editContent}
          onChangeText={setEditContent}
          multiline
          placeholder="Start typing..."
          placeholderTextColor={c.textTertiary}
          textAlignVertical="top"
          autoFocus
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <View style={[styles.listHeader, { borderBottomColor: c.border }]}>
        <Text style={[styles.listTitle, { color: c.text }]}>Notes</Text>
        <TouchableOpacity onPress={createNote} style={[styles.addBtn, { backgroundColor: c.primaryMuted }]}>
          <Plus size={18} color={c.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.listContent}>
        {notes.map((note) => (
          <TouchableOpacity
            key={note.id}
            style={[styles.noteRow, { backgroundColor: c.surface, borderColor: c.border }]}
            onPress={() => openNote(note)}
          >
            <FileText size={16} color={c.textTertiary} />
            <View style={styles.noteInfo}>
              <Text style={[styles.noteTitle, { color: c.text }]} numberOfLines={1}>{note.title}</Text>
              <Text style={[styles.notePreview, { color: c.textTertiary }]} numberOfLines={1}>
                {note.content.split('\n').slice(1).join(' ').trim() || 'Empty note'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 0.5 },
  listTitle: { fontSize: fontSize.lg, fontFamily: 'Inter_700Bold' },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 0.5 },
  noteInfo: { flex: 1, gap: 2 },
  noteTitle: { fontSize: fontSize.md, fontFamily: 'Inter_600SemiBold' },
  notePreview: { fontSize: fontSize.xs, fontFamily: 'Inter_400Regular' },
  editorHeader: { flexDirection: 'row', justifyContent: 'flex-end', padding: spacing.lg, borderBottomWidth: 0.5 },
  backLink: { fontSize: fontSize.md, fontFamily: 'Inter_600SemiBold' },
  editor: { flex: 1, padding: spacing.lg, fontSize: fontSize.md, fontFamily: 'Inter_400Regular', lineHeight: 24 },
});
