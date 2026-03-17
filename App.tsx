import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rede Verde Expo</Text>
      <Text style={styles.subtitle}>
        Projeto base criado com Expo e pronto para evoluir.
      </Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f3ed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#183527',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#30453c',
    textAlign: 'center',
    lineHeight: 24,
  },
});
