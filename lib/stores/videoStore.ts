export const VideoStore = {
  async storeVideo(file: File): Promise<string> {
    // MVP uses object URLs. For refresh-safe persistence, move binary storage to IndexedDB.
    const url = URL.createObjectURL(file);
    return url;
  }
};
