'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { AppFrame } from '@/app/components/AppFrame'
import { LoadingState } from '@/app/components/LoadingState'
import { UploadDashboard } from '@/app/components/UploadDashboard'
import { useAuthSession } from '@/app/hooks/useAuthSession'
import { useFiles } from '@/app/hooks/useFiles'

export default function UploadPage() {
  const router = useRouter()
  const { user, loading, checkSession, logout } = useAuthSession()
  const {
    files,
    filesLoading,
    filesError,
    uploading,
    uploadError,
    isDragActive,
    deletingIds,
    syncing,
    fetchFiles,
    syncWorkspace,
    deleteFile,
    copyLink,
    handleDrag,
    handleDrop,
    handleFileChange,
    setFiles,
  } = useFiles()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [loading, router, user])

  useEffect(() => {
    if (user) {
      fetchFiles()
    } else {
      setFiles([])
    }
  }, [user, fetchFiles, setFiles])

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
          files={files}
          filesLoading={filesLoading}
          filesError={filesError}
          uploading={uploading}
          uploadError={uploadError}
          isDragActive={isDragActive}
          syncing={syncing}
          deletingIds={deletingIds}
          onLogout={handleLogout}
          onRefreshSession={checkSession}
          onRefreshFiles={fetchFiles}
          onSyncWorkspace={syncWorkspace}
          onCopyLink={copyLink}
          onDeleteFile={deleteFile}
          onDrag={handleDrag}
          onDrop={handleDrop}
          onFileChange={handleFileChange}
        />
      )}
    </AppFrame>
  )
}
