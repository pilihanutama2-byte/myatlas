/* =========================================================
   MAN ATLAS — Cloud Sync (Supabase)
   Public visitors: read-only view of the owner's Atlas.
   Owner (logged in): full edit rights, changes push to the cloud.
   ========================================================= */
(function(){

  const SUPABASE_URL = 'https://cydgaachtgqbbesarqfu.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5ZGdhYWNodGdxYmJlc2FycWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NzEwMjEsImV4cCI6MjA5OTQ0NzAyMX0.yT7I_bdomcJUJeBQCzjfCUDojtt1rifNJjOGR1zauIM';
  const ROW_ID = 'main';

  let client = null;
  try{
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }catch(e){
    console.warn('MAN ATLAS: Supabase client failed to init — running in offline/local-only mode.', e);
  }

  /** A bare "Failed to fetch" TypeError means the request never reached Supabase
   * at all (network/DNS/CORS/blocked-by-extension/project-paused) — as opposed
   * to an error object Supabase itself returned. Translating it here means every
   * call site (login, pull, push, comments) gives the user the same actionable
   * hint instead of a cryptic browser error string. */
  function friendlyNetworkError(e){
    const msg = (e && e.message) || String(e);
    if(/failed to fetch|networkerror|load failed/i.test(msg)){
      return 'Gagal terhubung ke server (bukan salah password). Kemungkinan: project Supabase sedang pause, koneksi internet bermasalah, atau diblokir oleh extension/browser. / Could not reach the server (not a wrong-password issue). Possible causes: Supabase project is paused, network issue, or blocked by a browser extension.';
    }
    return msg;
  }

  window.AtlasSync = {
    client,
    isOwner: false,
    // Timestamp of the row as of our last successful pull. Used to detect
    // whether another device pushed newer data in between, so a push from
    // this device never silently clobbers it (see push() below).
    lastKnownUpdatedAt: null,

    /** Check for an existing logged-in session (persists across visits on the same browser). */
    async checkSession(){
      if(!client) return false;
      try{
        const { data } = await client.auth.getSession();
        this.isOwner = !!(data && data.session);
        return this.isOwner;
      }catch(e){
        console.warn('MAN ATLAS session check failed:', friendlyNetworkError(e));
        return false;
      }
    },

    async login(email, password){
      if(!client) return { error: 'Offline mode — no cloud connection.' };
      try{
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if(error) return { error: error.message };
        this.isOwner = true;
        return { data };
      }catch(e){
        return { error: friendlyNetworkError(e) };
      }
    },

    async logout(){
      if(!client) return;
      try{ await client.auth.signOut(); }catch(e){ console.warn('MAN ATLAS logout failed:', friendlyNetworkError(e)); }
      this.isOwner = false;
    },

    /** Pull the shared Atlas state. Anyone can read — used so visitors see the owner's live Atlas. */
    async pull(){
      if(!client) return null;
      try{
        const { data, error } = await client
          .from('atlas_public')
          .select('data, updated_at')
          .eq('id', ROW_ID)
          .maybeSingle();
        if(error){ console.warn('MAN ATLAS cloud pull failed:', error.message); return null; }
        if(data) this.lastKnownUpdatedAt = data.updated_at;
        return data ? data.data : null;
      }catch(e){
        console.warn('MAN ATLAS cloud pull failed:', friendlyNetworkError(e));
        return null;
      }
    },

    /** Push the current state. Only succeeds if logged in as owner (enforced by Row Level Security).
     * Before writing, checks whether the row changed since our last pull — this is the
     * "did the other device (PC/HP) save something after me?" guard. If it did, we refuse
     * to overwrite and return {conflict:true, cloudData} instead, so the caller can pull the
     * newer data first rather than silently losing it. Pass {force:true} to skip this check. */
    async push(stateObj, opts){
      const force = opts && opts.force;
      if(!client || !this.isOwner) return { ok:false, error:'not-owner' };
      try{
        if(!force){
          const { data: current, error: checkErr } = await client
            .from('atlas_public')
            .select('updated_at')
            .eq('id', ROW_ID)
            .maybeSingle();
          if(!checkErr && current && this.lastKnownUpdatedAt && current.updated_at !== this.lastKnownUpdatedAt){
            // Someone else (another device) saved a newer version in between.
            const cloudData = await this.pull();
            return { ok:false, conflict:true, cloudData };
          }
        }
        const now = new Date().toISOString();
        const { error } = await client
          .from('atlas_public')
          .upsert({ id: ROW_ID, data: stateObj, updated_at: now });
        if(error){ console.warn('MAN ATLAS cloud push failed:', error.message); return { ok:false, error: error.message }; }
        this.lastKnownUpdatedAt = now;
        return { ok:true };
      }catch(e){
        const msg = friendlyNetworkError(e);
        console.warn('MAN ATLAS cloud push failed:', msg);
        return { ok:false, error: msg };
      }
    },

    /** Public comment wall — anyone (including anonymous visitors) can cheer the owner on. */
    async fetchComments(){
      if(!client) return [];
      const { data, error } = await client
        .from('atlas_comments')
        .select('id, name, message, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if(error){ console.warn('MAN ATLAS comments fetch failed:', error.message); return []; }
      return data || [];
    },
    async postComment(name, message){
      if(!client) return { error: 'Offline mode — no cloud connection.' };
      const { error } = await client
        .from('atlas_comments')
        .insert({ name: (name || 'Anonymous').slice(0,40), message: message.slice(0,300) });
      if(error) return { error: error.message };
      return { ok: true };
    },
  };

})();
