import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Serve a receipt photo to anyone who can see the expense it belongs to.
 *
 * The bucket is private and its storage policy only lets the uploader read
 * their own objects, which is right — but everyone splitting an expense needs
 * to see its receipt. Rather than loosening the bucket, this route checks
 * access as the signed-in user and then mints a short-lived signed URL with
 * the service role.
 *
 * The authorisation check is what makes using the service role here safe: the
 * elevated client is only reached after RLS has already confirmed this user
 * can see the row.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  // RLS on expense_images means this returns nothing unless the user can
  // access the parent expense.
  const { data: image } = await supabase
    .from('expense_images')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (!image) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from('receipts')
    .createSignedUrl(image.storage_path, 60 * 10)

  if (error || !data) {
    return NextResponse.json({ error: 'Could not load that image' }, { status: 500 })
  }

  return NextResponse.redirect(data.signedUrl)
}
