import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadMediaLibraryFile } from '../../utils/mediaLibraryUpload';

const MediaLibraryUploadButton = ({ user, disabled = false, label = 'Agregar Multimedia', options = {}, onUploaded, onError, className = '' }) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadMediaLibraryFile(file, { ...options, userId: user?.uid || null });
      onUploaded?.(result.media, result);
    } catch (error) {
      onError?.(error);
    } finally {
      setUploading(false);
    }
  };

  return <>
    <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime,video/x-m4v" className="hidden" onChange={handleFile} />
    <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || uploading} className={className}>
      <Upload size={16} className={uploading ? 'animate-pulse' : ''} />
      {uploading ? 'Subiendo...' : label}
    </button>
  </>;
};

export default MediaLibraryUploadButton;
