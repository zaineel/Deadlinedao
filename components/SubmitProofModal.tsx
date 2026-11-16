'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useWallet } from '@solana/wallet-adapter-react';
import { buildProofMessage, proofPayload } from '@/lib/auth/proof-message';
import { Loader2, Upload, CheckCircle2, XCircle, Image as ImageIcon } from 'lucide-react';

interface SubmitProofModalProps {
  goalId: string;
  goalTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SubmitProofModal({ goalId, goalTitle, open, onOpenChange, onSuccess }: SubmitProofModalProps) {
  const { signMessage } = useWallet();
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<{
    verdict: string;
    confidence: number;
    reasoning: string;
  } | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Please provide a description of your proof');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      // Step 1: Upload image to Cloudflare R2 if present
      let imageUrl = null;
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        formData.append('goalId', goalId);

        const uploadResponse = await fetch('/api/upload/proof', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload image');
        }

        const uploadData = await uploadResponse.json();
        imageUrl = uploadData.url;
      }

      // Step 2: Sign the submission with the wallet to prove ownership
      if (!signMessage) {
        throw new Error('Your wallet does not support message signing');
      }
      const timestamp = Date.now();
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(proofPayload(description, imageUrl)) as BufferSource
      );
      const payloadHash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const signatureBytes = await signMessage(
        new TextEncoder().encode(buildProofMessage(goalId, timestamp, payloadHash))
      );
      const signature = btoa(String.fromCharCode(...signatureBytes));

      // Step 3: Submit proof and get AI validation
      const proofResponse = await fetch('/api/proofs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_id: goalId,
          text_description: description,
          image_url: imageUrl,
          timestamp,
          signature,
        }),
      });

      if (!proofResponse.ok) {
        const errorData = await proofResponse.json();
        throw new Error(errorData.error || 'Failed to submit proof');
      }

      const proofData = await proofResponse.json();

      // Set AI verdict results
      setAiVerdict({
        verdict: proofData.validation?.verdict || 'needs_review',
        confidence: proofData.validation?.confidence || 0,
        reasoning: proofData.validation?.reasoning || 'Processing validation...',
      });

      setSuccess(true);

      // Call success callback immediately to refresh dashboard
      if (onSuccess) onSuccess();

    } catch (err: any) {
      console.error('Error submitting proof:', err);
      setError(err.message || 'Failed to submit proof. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setDescription('');
    setImageFile(null);
    setImagePreview(null);
    setError('');
    setSuccess(false);
    setAiVerdict(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-gray-900 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            Submit Proof
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Goal: {goalTitle}
          </DialogDescription>
        </DialogHeader>

        {!success ? (
          <div className="space-y-6 py-4">
            {/* Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="proof-image" className="text-white">
                Upload Proof Image (Optional)
              </Label>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="proof-image"
                  className="flex flex-col items-center justify-center w-full h-48 border-2 border-gray-700 border-dashed rounded-lg cursor-pointer bg-gray-800/50 hover:bg-gray-800 transition-colors relative"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith('image/')) {
                      setImageFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setImagePreview(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                >
                  {imagePreview ? (
                    <div className="relative w-full h-full">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="h-full w-full object-contain rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <ImageIcon className="w-10 h-10 mb-3 text-gray-400" />
                      <p className="mb-2 text-sm text-gray-400">
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG or JPEG (MAX. 10MB)</p>
                    </div>
                  )}
                  <Input
                    id="proof-image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-white">
                Description *
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe how you completed your goal..."
                className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 min-h-[120px]"
                required
              />
              <p className="text-xs text-gray-500">
                Be specific about what you accomplished and how it meets your goal criteria
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 text-white font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting & Validating with AI...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Submit Proof
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-8">
            {/* Success State with AI Verdict */}
            <div className="text-center">
              {aiVerdict?.verdict === 'approved' ? (
                <>
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-400" />
                  <h3 className="text-2xl font-bold text-green-400 mb-2">Proof Approved!</h3>
                  <p className="text-gray-400 mb-4">AI Confidence: {aiVerdict.confidence}%</p>
                </>
              ) : (
                <>
                  <XCircle className="w-16 h-16 mx-auto mb-4 text-red-400" />
                  <h3 className="text-2xl font-bold text-red-400 mb-2">Proof Rejected</h3>
                  <p className="text-gray-400 mb-4">AI Confidence: {aiVerdict?.confidence}%</p>
                </>
              )}

              <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">AI Analysis:</h4>
                <p className="text-sm text-gray-400 leading-relaxed">{aiVerdict?.reasoning}</p>
              </div>

              <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-400 font-semibold mb-2">
                  {aiVerdict?.verdict === 'approved' ? '💰 Payout Information' : '⚠️ What Happens Next'}
                </p>
                <p className="text-sm text-gray-400">
                  {aiVerdict?.verdict === 'approved'
                    ? 'Your stake will be returned plus rewards from the pool!'
                    : 'Your stake will be added to the reward pool for successful participants.'}
                </p>
              </div>

              <p className="text-xs text-gray-500 italic">
                Click the X button to close this window
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
