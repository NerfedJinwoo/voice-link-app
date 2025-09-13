import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, File, Image, Video } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface FileUploadProps {
  onFileSelect: (file: File, type: 'image' | 'video' | 'document') => void;
  accept?: string;
  maxSize?: number; // in MB
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileSelect, 
  accept = "image/*,video/*,.pdf,.doc,.docx,.txt",
  maxSize = 50
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      toast({
        title: "File too large",
        description: `Please select a file smaller than ${maxSize}MB`,
        variant: "destructive",
      });
      return;
    }

    // Determine file type
    let fileType: 'image' | 'video' | 'document' = 'document';
    if (file.type.startsWith('image/')) {
      fileType = 'image';
    } else if (file.type.startsWith('video/')) {
      fileType = 'video';
    }

    onFileSelect(file, fileType);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={openFilePicker}
        className="hover:scale-110 transition-transform"
      >
        <Upload className="w-5 h-5" />
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
};

export const FilePreview: React.FC<{ file: File; onRemove: () => void }> = ({ file, onRemove }) => {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  
  return (
    <div className="flex items-center gap-2 p-2 bg-accent rounded-lg">
      {isImage && <Image className="w-4 h-4 text-blue-500" />}
      {isVideo && <Video className="w-4 h-4 text-green-500" />}
      {!isImage && !isVideo && <File className="w-4 h-4 text-gray-500" />}
      
      <span className="text-sm font-medium truncate flex-1">{file.name}</span>
      <span className="text-xs text-muted-foreground">
        {(file.size / 1024 / 1024).toFixed(1)}MB
      </span>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
      >
        ×
      </Button>
    </div>
  );
};