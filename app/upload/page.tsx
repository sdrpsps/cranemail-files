'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { AppFrame } from '@/app/components/AppFrame'
import { LoadingState } from '@/app/components/LoadingState'
import { ToastNotification } from '@/app/components/ToastNotification'
import { UploadDashboard } from '@/app/components/UploadDashboard'
import { useAuthSession } from '@/app/hooks/useAuthSession'
import { useImages } from '@/app/hooks/useImages'
import { useToast } from '@/app/hooks/useToast'

export default function UploadPage() {
  const router = useRouter()
  const { user, loading, checkSession, logout } = useAuthSession()
  const { toast, showToast } = useToast()
  const {
    images,
    imagesLoading,
    imagesError,
    uploading,
    uploadError,
    isDragActive,
    deletingIds,
    syncing,
    fetchImages,
    syncWorkspace,
    deleteImage,
    copyLink,
    handleDrag,
    handleDrop,
    handleFileChange,
    setImages,
  } = useImages({ showToast })

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [loading, router, user])

  useEffect(() => {
    if (user) {
      fetchImages()
    } else {
      setImages([])
    }
  }, [user, fetchImages, setImages])

  const handleLogout = async () => {
    await logout()
    router.replace('/')
  }

  return (
    <AppFrame width="wide">
      {loading || !user ? (
        <LoadingState />
      ) : (
        <UploadDashboard
          user={user}
          images={images}
          imagesLoading={imagesLoading}
          imagesError={imagesError}
          uploading={uploading}
          uploadError={uploadError}
          isDragActive={isDragActive}
          syncing={syncing}
          deletingIds={deletingIds}
          onLogout={handleLogout}
          onRefreshSession={checkSession}
          onSyncWorkspace={syncWorkspace}
          onCopyLink={copyLink}
          onDeleteImage={deleteImage}
          onDrag={handleDrag}
          onDrop={handleDrop}
          onFileChange={handleFileChange}
        />
      )}
      <ToastNotification toast={toast} />
    </AppFrame>
  )
}
