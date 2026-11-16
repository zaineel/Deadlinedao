import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, View } from 'react-native';
import type { UploadFile } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-context';
import { submitProofWithWallet } from '../../src/flows';
import { Body, Button, ErrorText, errorMessage, Field, Screen } from '../../src/ui/kit';

/** The upload API only accepts JPEG and PNG. */
function toUploadFile(asset: ImagePicker.ImagePickerAsset): UploadFile {
  const isPng = asset.mimeType === 'image/png' || /\.png$/i.test(asset.uri);
  return { uri: asset.uri, name: isPng ? 'proof.png' : 'proof.jpg', type: isPng ? 'image/png' : 'image/jpeg' };
}

export default function SubmitProof() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, wallet } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const pick = async (source: 'camera' | 'library') => {
    setError(null);
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Permission denied. Enable it in Settings to attach a photo.');
      return;
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!res.canceled && res.assets[0]) setImage(res.assets[0]);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await submitProofWithWallet(wallet, api, {
        goalId: id,
        text: text.trim(),
        image: image ? toUploadFile(image) : null,
      });
      setResult(
        res.goal_status === 'completed'
          ? 'Approved. Your stake is on its way back.'
          : res.goal_status === 'failed'
            ? 'Proof was rejected.'
            : 'Proof submitted and awaiting review.'
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Screen>
        <Body>{result}</Body>
        <Button title="Done" onPress={() => router.dismissTo('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Field
        label="What did you do?"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={5000}
        style={{ minHeight: 120 }}
      />
      {image && <Image source={{ uri: image.uri }} style={{ width: '100%', height: 220, borderRadius: 12 }} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Camera" variant="secondary" onPress={() => pick('camera')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Library" variant="secondary" onPress={() => pick('library')} />
        </View>
      </View>
      <Body muted>Phantom will ask you to sign a free message that authorizes this submission.</Body>
      <ErrorText message={error} />
      <Button title="Submit proof" onPress={submit} loading={busy} disabled={!text.trim()} />
    </Screen>
  );
}
