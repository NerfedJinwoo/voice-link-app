import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, File, Image, Video } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface FileUploadProps {
  onFileSelect: (file: File, type: 'image' | 'video' | 'document') => void;
  onFileUploaded?: (url: string, type: 'image' | 'video' | 'document') => void;
  accept?: string;
  maxSize?: number; // in MB
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileSelect, 
  onFileUploaded,
  accept = "image/*,video/*,.pdf,.doc,.docx,.txt",
  maxSize = 50
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    // Call the local callback first for immediate preview
    onFileSelect(file, fileType);

    // Upload to Supabase Storage if user is authenticated
    if (user && onFileUploaded) {
      await uploadToStorage(file, fileType);
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadToStorage = async (file: File, fileType: 'image' | 'video' | 'document') => {
    if (!user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}.${fileExt}`;

    try {
      const { data, error } = await supabase.storage
        .from('chat-files')
        .upload(fileName, file);

      if (error) {
        console.error('Upload error:', error);
        toast({
          title: "Upload failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-files')
        .getPublicUrl(fileName);

      if (urlData.publicUrl && onFileUploaded) {
        onFileUploaded(urlData.publicUrl, fileType);
        toast({
          title: "File uploaded",
          description: "File uploaded successfully",
        });
      }
    } catch (error) {
      console.error('Storage upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload file",
        variant: "destructive",
      });
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
        type="button"
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