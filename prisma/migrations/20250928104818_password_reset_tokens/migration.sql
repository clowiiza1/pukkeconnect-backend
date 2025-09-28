-- Create password reset token table
CREATE TABLE IF NOT EXISTS password_reset_token (
  token_id    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid NOT NULL,
  token_hash  varchar(100) NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  request_ip  varchar(45),
  user_agent  varchar(255),
  CONSTRAINT password_reset_token_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES app_user(user_id) ON UPDATE NO ACTION ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_user ON password_reset_token(user_id);
