import { createOTP } from './otp.js';
import { supabase } from '../lib/supabase.js';

// Beautiful HTML email template for OTP
function getOTPEmailTemplate(name: string, otp: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - SyntraIQ</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F8F7F4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F8F7F4; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #C7A869 0%, #B8955A 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                SyntraIQ
              </h1>
              <p style="margin: 8px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">
                Elegant AI Search
              </p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px 0; color: #111111; font-size: 24px; font-weight: 600;">
                Verify Your Email Address
              </h2>
              
              <p style="margin: 0 0 30px 0; color: #4B4B4B; font-size: 16px; line-height: 1.6;">
                Hi ${name || 'there'},
              </p>
              
              <p style="margin: 0 0 30px 0; color: #4B4B4B; font-size: 16px; line-height: 1.6;">
                Welcome to SyntraIQ! To complete your signup, please verify your email address using the 6-digit code below:
              </p>
              
              <!-- OTP Code Box -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td align="center">
                    <div style="background: linear-gradient(135deg, #C7A869 0%, #B8955A 100%); border-radius: 12px; padding: 30px; text-align: center; box-shadow: 0 4px 12px rgba(199, 168, 105, 0.3);">
                      <p style="margin: 0 0 15px 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">
                        Your Verification Code
                      </p>
                      <div style="display: inline-block; background-color: #FFFFFF; border-radius: 8px; padding: 20px 40px; margin: 10px 0;">
                        <p style="margin: 0; color: #C7A869; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                          ${otp}
                        </p>
                      </div>
                      <p style="margin: 20px 0 0 0; color: rgba(255, 255, 255, 0.8); font-size: 12px;">
                        This code expires in 10 minutes
                      </p>
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #4B4B4B; font-size: 14px; line-height: 1.6;">
                If you didn't create an account with SyntraIQ, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #F8F7F4; border-top: 1px solid #EBE8E1; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #4B4B4B; font-size: 12px;">
                © ${new Date().getFullYear()} SyntraIQ. All rights reserved.
              </p>
              <p style="margin: 0; color: #4B4B4B; font-size: 12px;">
                This is an automated email, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Send OTP email using Supabase (you can also use Resend, SendGrid, etc.)
export async function sendOTPEmail(userId: string, email: string, name: string): Promise<string> {
  try {
    // Generate OTP
    const otp = await createOTP(userId, email);

    // Create email HTML
    const htmlContent = getOTPEmailTemplate(name, otp);

    // Use Supabase's built-in email or a service like Resend
    // For now, we'll use a simple approach - in production, use a proper email service
    // You can integrate Resend, SendGrid, AWS SES, etc.
    
    // Log for development (remove in production)
    console.log(`📧 OTP Email for ${email}: ${otp}`);
    console.log(`Email HTML length: ${htmlContent.length} characters`);

    // TODO: Integrate with actual email service
    // For Supabase, you might want to use their email templates or integrate Resend
    // Example with Resend (uncomment and configure):
    /*
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'SyntraIQ <noreply@yourdomain.com>',
      to: email,
      subject: 'Verify Your Email - SyntraIQ',
      html: htmlContent,
    });
    */

    return otp;
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    throw new Error('Failed to send verification email');
  }
}

// For development: return the OTP in response (remove in production)
export function getOTPForDevelopment(email: string): Promise<string | null> {
  // In development, we can query the OTP from database
  return new Promise(async (resolve) => {
    const { data } = await supabase
      .from('email_otps')
      .select('otp_code')
      .eq('email', email.toLowerCase().trim())
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    resolve(data?.otp_code || null);
  });
}

