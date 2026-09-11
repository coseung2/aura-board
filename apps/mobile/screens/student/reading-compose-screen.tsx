import { ScrollView, StyleSheet, Text, View } from "react-native";
import { InputPage } from "../../components/input-page";
import { SectionNav, SectionNavItem } from "../../components/NavigationTabs";
import { AppButton, TextField } from "../../components/ui";
import { useInputPageExit } from "../../hooks/use-input-page-exit";
import { colors, composer, spacing, typography } from "../../theme/tokens";
import { useReadingScreen } from "./reading-screen-context";

export default function ReadingComposeScreen() {
  const model = useReadingScreen();
  const original = model.entries.find(
    (entry) => entry.id === model.editingEntryId,
  );
  const changed = Boolean(
    original &&
    (model.title !== original.title ||
      model.author !== original.author ||
      model.reflection !== original.reflection ||
      model.bookType !== original.bookType),
  );
  const exit = useInputPageExit(changed, model.saving);
  return (
    <InputPage
      title={model.editingEntryId ? "독서 기록 수정" : "독서 기록 작성"}
      onBack={exit.back}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <SectionNav accessibilityLabel="책 종류">
          <SectionNavItem
            selected={model.bookType === "story"}
            onPress={() => model.setBookType("story")}
          >
            이야기책
          </SectionNavItem>
          <SectionNavItem
            selected={model.bookType === "comic"}
            onPress={() => model.setBookType("comic")}
          >
            만화책
          </SectionNavItem>
        </SectionNav>
        <View style={styles.field}>
          <Text style={styles.label}>책 제목</Text>
          <TextField
            value={model.title}
            onChangeText={model.setTitle}
            accessibilityLabel="책 제목"
            placeholder="책 제목"
            maxLength={80}
            editable={!model.saving}
            returnKeyType="next"
            onSubmitEditing={() => model.authorInputRef.current?.focus()}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>지은이</Text>
          <TextField
            ref={model.authorInputRef}
            value={model.author}
            onChangeText={model.setAuthor}
            accessibilityLabel="지은이"
            placeholder="지은이"
            maxLength={60}
            editable={!model.saving}
            returnKeyType="next"
            onSubmitEditing={() => model.reflectionInputRef.current?.focus()}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>독서 감상</Text>
          <TextField
            ref={model.reflectionInputRef}
            value={model.reflection}
            onChangeText={model.setReflection}
            accessibilityLabel="독서 감상"
            placeholder="재미있었던 점이나 느낀 점"
            maxLength={600}
            multiline
            editable={!model.saving}
            style={styles.reflection}
          />
        </View>
        {model.error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {model.error}
          </Text>
        ) : null}
        <AppButton
          loading={model.saving}
          onPress={async () => {
            if (await model.save()) exit.finish();
          }}
        >
          {model.editingEntryId ? "수정하기" : "저장하기"}
        </AppButton>
      </ScrollView>
    </InputPage>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.xl, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  reflection: {
    minHeight: composer.contentMinHeight,
    textAlignVertical: "top",
  },
  error: { ...typography.body, color: colors.danger },
});
