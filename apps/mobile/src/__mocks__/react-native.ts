// Minimal React Native mock for Jest (no RN runtime in test env)
export const View = "View";
export const Text = "Text";
export const Switch = "Switch";
export const TouchableOpacity = "TouchableOpacity";
export const StyleSheet = { create: (s: object) => s };
